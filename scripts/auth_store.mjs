/**
 * PhysAlts — Production-Grade Local/Self-Hosted Account & Bookmark Store
 * Uses Node native crypto.scryptSync (per-user random salt) + timingSafeEqual + HMAC-SHA256 tokens.
 * Persists atomically to data_local/accounts.json (gitignored).
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_FOLDERS = ["Shortlist", "Study List", "Apply & Jobs", "Research"];
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_ATTEMPTS = 25;

export class AuthStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.storeFile = path.join(dataDir, "accounts.json");
    this.secretFile = path.join(dataDir, "session.secret");
    this.secret = null;
    this.db = { users: {}, revokedTokens: {} };
    this.rateMap = new Map();
    this.readyPromise = this._init();
  }

  async _init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      this.secret = (await fs.readFile(this.secretFile, "utf8")).trim();
    } catch {
      this.secret = crypto.randomBytes(32).toString("hex");
      await fs.writeFile(this.secretFile, this.secret + "\n", { mode: 0o600 });
    }
    try {
      const raw = await fs.readFile(this.storeFile, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.users === "object") {
        this.db = {
          users: parsed.users || {},
          revokedTokens: parsed.revokedTokens || {}
        };
      }
    } catch {
      await this._save();
    }
  }

  async _save() {
    // Prune expired revoked tokens
    const now = Date.now();
    for (const [jti, exp] of Object.entries(this.db.revokedTokens || {})) {
      if (exp < now) delete this.db.revokedTokens[jti];
    }
    const tmp = `${this.storeFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.db, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.storeFile);
  }

  checkRateLimit(ip) {
    const key = ip || "local";
    const now = Date.now();
    const rec = this.rateMap.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };
    if (now > rec.resetAt) {
      rec.count = 0;
      rec.resetAt = now + RATE_WINDOW_MS;
    }
    rec.count += 1;
    this.rateMap.set(key, rec);
    return rec.count <= RATE_MAX_ATTEMPTS;
  }

  _hashPassword(password, saltHex = null) {
    const salt = saltHex || crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash: derived };
  }

  _verifyPassword(password, salt, expectedHashHex) {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHashHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }

  _signToken(userId) {
    const payload = {
      uid: userId,
      jti: crypto.randomBytes(12).toString("hex"),
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sig = crypto.createHmac("sha256", this.secret).update(encoded).digest("base64url");
    return `${encoded}.${sig}`;
  }

  async verifyToken(token) {
    await this.readyPromise;
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", this.secret).update(encoded).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (!payload?.uid || !payload.exp || payload.exp < Date.now()) return null;
      if (this.db.revokedTokens?.[payload.jti]) return null;
      const user = this.db.users[payload.uid];
      if (!user) return null;
      return { user, payload };
    } catch {
      return null;
    }
  }

  sanitizeUser(user) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio || "",
      researchFocus: user.researchFocus || "",
      stage: user.stage || "undergrad",
      folders: Array.isArray(user.folders) && user.folders.length ? user.folders : [...DEFAULT_FOLDERS],
      bookmarks: Array.isArray(user.bookmarks) ? user.bookmarks : [],
      shortlist: Array.isArray(user.shortlist) ? user.shortlist : [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  _normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  _validateBookmarks(rawList) {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set();
    const out = [];
    for (const item of rawList.slice(0, 500)) {
      if (!item || typeof item.id !== "string" || !item.id.trim()) continue;
      const id = item.id.trim().slice(0, 140);
      if (seen.has(id)) continue;
      seen.add(id);
      const url = typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? item.url.slice(0, 512) : "";
      out.push({
        id,
        kind: ["hub", "timeline", "space", "material"].includes(item.kind) ? item.kind : "hub",
        title: String(item.title || id).trim().slice(0, 180),
        subtitle: String(item.subtitle || "").trim().slice(0, 180),
        url,
        folder: String(item.folder || "Shortlist").trim().slice(0, 48) || "Shortlist",
        note: String(item.note || "").trim().slice(0, 600),
        savedAt: Number(item.savedAt) || Date.now()
      });
    }
    return out;
  }

  async register({ email, password, displayName, stage, initialBookmarks, initialShortlist }) {
    await this.readyPromise;
    const normEmail = this._normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail) || normEmail.length > 160) {
      return { error: "Please enter a valid email address.", status: 400 };
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return { error: "Password must be between 8 and 128 characters.", status: 400 };
    }
    const cleanName = String(displayName || normEmail.split("@")[0]).trim().slice(0, 80);
    if (cleanName.length < 2) {
      return { error: "Display name must be at least 2 characters.", status: 400 };
    }

    const exists = Object.values(this.db.users).some(u => u.email === normEmail);
    if (exists) {
      return { error: "An account with this email already exists. Try signing in instead.", status: 409 };
    }

    const id = `usr_${crypto.randomBytes(12).toString("hex")}`;
    const { salt, hash } = this._hashPassword(password);
    const now = Date.now();
    const bookmarks = this._validateBookmarks(initialBookmarks);
    const shortlistSet = new Set([
      ...(Array.isArray(initialShortlist) ? initialShortlist.filter(x => typeof x === "string").slice(0, 500) : []),
      ...bookmarks.filter(b => b.kind === "hub" || b.kind === "timeline").map(b => b.id)
    ]);

    const user = {
      id,
      email: normEmail,
      displayName: cleanName,
      bio: "",
      researchFocus: "",
      stage: typeof stage === "string" ? stage.slice(0, 32) : "undergrad",
      folders: [...DEFAULT_FOLDERS],
      bookmarks,
      shortlist: [...shortlistSet],
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now
    };
    this.db.users[id] = user;
    await this._save();

    const token = this._signToken(id);
    return { status: 201, user: this.sanitizeUser(user), token };
  }

  async login({ email, password }) {
    await this.readyPromise;
    const normEmail = this._normalizeEmail(email);
    const user = Object.values(this.db.users).find(u => u.email === normEmail);
    if (!user || typeof password !== "string" || !this._verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return { error: "Incorrect email or password.", status: 401 };
    }
    const token = this._signToken(user.id);
    return { status: 200, user: this.sanitizeUser(user), token };
  }

  async logout(token) {
    const verified = await this.verifyToken(token);
    if (verified?.payload?.jti) {
      this.db.revokedTokens[verified.payload.jti] = verified.payload.exp;
      await this._save();
    }
    return { ok: true };
  }

  async updateProfile(userId, patch) {
    await this.readyPromise;
    const user = this.db.users[userId];
    if (!user) return { error: "Account not found.", status: 404 };
    if (typeof patch.displayName === "string") {
      const name = patch.displayName.trim().slice(0, 80);
      if (name.length >= 2) user.displayName = name;
    }
    if (typeof patch.bio === "string") user.bio = patch.bio.trim().slice(0, 320);
    if (typeof patch.researchFocus === "string") user.researchFocus = patch.researchFocus.trim().slice(0, 120);
    if (typeof patch.stage === "string") user.stage = patch.stage.trim().slice(0, 32);
    user.updatedAt = Date.now();
    await this._save();
    return { status: 200, user: this.sanitizeUser(user) };
  }

  async updateBookmarks(userId, { bookmarks, folders, shortlist }) {
    await this.readyPromise;
    const user = this.db.users[userId];
    if (!user) return { error: "Account not found.", status: 404 };
    if (Array.isArray(bookmarks)) {
      user.bookmarks = this._validateBookmarks(bookmarks);
    }
    if (Array.isArray(folders)) {
      const cleanFolders = [...new Set(
        folders.map(f => String(f || "").trim().slice(0, 48)).filter(Boolean)
      )].slice(0, 20);
      if (cleanFolders.length) user.folders = cleanFolders;
    }
    if (Array.isArray(shortlist)) {
      user.shortlist = [...new Set(shortlist.filter(x => typeof x === "string").map(x => x.slice(0, 140)))].slice(0, 500);
    }
    user.updatedAt = Date.now();
    await this._save();
    return { status: 200, user: this.sanitizeUser(user) };
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    await this.readyPromise;
    const user = this.db.users[userId];
    if (!user) return { error: "Account not found.", status: 404 };
    if (!this._verifyPassword(String(currentPassword || ""), user.passwordSalt, user.passwordHash)) {
      return { error: "Current password is incorrect.", status: 401 };
    }
    if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
      return { error: "New password must be between 8 and 128 characters.", status: 400 };
    }
    const { salt, hash } = this._hashPassword(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    user.updatedAt = Date.now();
    await this._save();
    const token = this._signToken(user.id);
    return { status: 200, user: this.sanitizeUser(user), token };
  }

  async deleteAccount(userId, token) {
    await this.readyPromise;
    if (!this.db.users[userId]) return { error: "Account not found.", status: 404 };
    delete this.db.users[userId];
    const verified = await this.verifyToken(token).catch(() => null);
    if (verified?.payload?.jti) {
      this.db.revokedTokens[verified.payload.jti] = verified.payload.exp;
    }
    await this._save();
    return { status: 200, ok: true };
  }
}
