"""
World of Science — Blender 4.0 Cycles 3D Earth & Orbital Arcs Renderer
Renders photoreal dark-space Blue Marble Earth with Fresnel atmospheric rim,
crimson & silver 3D research collaboration arcs, and expanding light-pulse rings.
Always disables OpenImageDenoiser (use_denoising = False) for headless Ubuntu Blender builds.
"""
import bpy
import math
import os
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
MODE = argv[0] if len(argv) > 0 else "arcs"   # "arcs" (Variant A) | "pulse" (Variant B)
OUT_DIR = argv[1] if len(argv) > 1 else "/tmp/blender_frames_a"
NUM_FRAMES = int(argv[2]) if len(argv) > 2 else 36
TEX_PATH = "/tmp/earth_bluemarble_eq.png"

os.makedirs(OUT_DIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 10
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.05
scene.cycles.use_denoising = False
scene.cycles.use_light_tree = False
scene.cycles.max_bounces = 2
scene.cycles.diffuse_bounces = 1
scene.cycles.glossy_bounces = 1
scene.cycles.transmission_bounces = 0
scene.cycles.volume_bounces = 0
scene.cycles.transparent_max_bounces = 2
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Filmic"
scene.view_settings.look = "Medium High Contrast"
scene.view_settings.exposure = 0.20

# Deep obsidian world background (#040406)
world = bpy.data.worlds.new("SpaceWorld")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
wl = world.node_tree.links
wn.clear()
bg = wn.new("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0.004, 0.004, 0.006, 1.0)
bg.inputs["Strength"].default_value = 1.0
wout = wn.new("ShaderNodeOutputWorld")
wl.new(bg.outputs["Background"], wout.inputs["Surface"])

# 1. Earth UV Sphere (high segment count for razor-sharp silhouette)
bpy.ops.mesh.primitive_uv_sphere_add(segments=80, ring_count=40, radius=1.0, location=(0, 0, 0))
earth = bpy.context.active_object
earth.name = "Earth"
bpy.ops.object.shade_smooth()

# Earth Material with equirectangular Blue Marble texture + subtle specular ocean sheen
earth_mat = bpy.data.materials.new("EarthMat")
earth_mat.use_nodes = True
en = earth_mat.node_tree.nodes
el = earth_mat.node_tree.links
en.clear()
e_out = en.new("ShaderNodeOutputMaterial")
e_bsdf = en.new("ShaderNodeBsdfPrincipled")
e_bsdf.inputs["Roughness"].default_value = 0.62
e_bsdf.inputs["Specular IOR Level"].default_value = 0.35
e_tex = en.new("ShaderNodeTexImage")
if os.path.exists(TEX_PATH):
    e_tex.image = bpy.data.images.load(TEX_PATH)
e_hsv = en.new("ShaderNodeHueSaturation")
e_hsv.inputs["Saturation"].default_value = 0.92
e_hsv.inputs["Value"].default_value = 1.25
el.new(e_tex.outputs["Color"], e_hsv.inputs["Color"])
el.new(e_hsv.outputs["Color"], e_bsdf.inputs["Base Color"])
el.new(e_bsdf.outputs["BSDF"], e_out.inputs["Surface"])
earth.data.materials.append(earth_mat)

def set_camera_only(obj):
    obj.visible_diffuse = False
    obj.visible_glossy = False
    obj.visible_transmission = False
    obj.visible_volume_scatter = False
    obj.visible_shadow = False

# 2. Subtle Monochrome Silver-White Fresnel Atmosphere Shell (camera-only, zero shadow/light-tree cost)
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.028, location=(0, 0, 0))
atmo = bpy.context.active_object
atmo.name = "Atmosphere"
bpy.ops.object.shade_smooth()
set_camera_only(atmo)
atmo_mat = bpy.data.materials.new("AtmoMat")
atmo_mat.cycles.emission_sampling = "NONE"
atmo_mat.use_nodes = True
an = atmo_mat.node_tree.nodes
al = atmo_mat.node_tree.links
an.clear()
a_out = an.new("ShaderNodeOutputMaterial")
a_mix = an.new("ShaderNodeMixShader")
a_trans = an.new("ShaderNodeBsdfTransparent")
a_emit = an.new("ShaderNodeEmission")
a_emit.inputs["Color"].default_value = (0.78, 0.80, 0.85, 1.0) if MODE == "arcs" else (0.85, 0.72, 0.72, 1.0)
a_emit.inputs["Strength"].default_value = 2.8
a_lw = an.new("ShaderNodeLayerWeight")
a_lw.inputs["Blend"].default_value = 0.24
a_pow = an.new("ShaderNodeMath")
a_pow.operation = "POWER"
a_pow.inputs[1].default_value = 4.2
al.new(a_lw.outputs["Facing"], a_pow.inputs[0])
al.new(a_pow.outputs["Value"], a_mix.inputs["Fac"])
al.new(a_trans.outputs["BSDF"], a_mix.inputs[1])
al.new(a_emit.outputs["Emission"], a_mix.inputs[2])
al.new(a_mix.outputs["Shader"], a_out.inputs["Surface"])
atmo.data.materials.append(atmo_mat)

# Helper: lat/lng -> 3D point on unit sphere (aligned with Blender UV sphere)
def latlng_to_xyz(lat_deg, lng_deg, r=1.008):
    lat = math.radians(lat_deg)
    lng = math.radians(lng_deg)
    x = r * math.cos(lat) * math.cos(lng)
    y = r * math.cos(lat) * math.sin(lng)
    z = r * math.sin(lat)
    return (x, y, z)

def make_emit_mat(name, rgba, strength):
    m = bpy.data.materials.new(name)
    m.cycles.emission_sampling = "NONE"
    m.use_nodes = True
    ns = m.node_tree.nodes
    ls = m.node_tree.links
    ns.clear()
    out = ns.new("ShaderNodeOutputMaterial")
    em = ns.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = rgba
    em.inputs["Strength"].default_value = strength
    ls.new(em.outputs["Emission"], out.inputs["Surface"])
    return m

crimson_mat = make_emit_mat("CrimsonArc", (0.72, 0.14, 0.14, 1.0), 2.4)
silver_mat = make_emit_mat("SilverArc", (0.88, 0.90, 0.94, 1.0), 1.8)
node_mat = make_emit_mat("HubBeacon", (1.0, 0.92, 0.92, 1.0), 4.5)

# Parent group for Earth + beacons + arcs so they rotate together cleanly!
pivot = bpy.data.objects.new("EarthPivot", None)
scene.collection.objects.link(pivot)
earth.parent = pivot
atmo.parent = pivot

# 3. Major Global STEM Hubs & 3D Great-Circle Collaboration Arcs
HUBS = {
    "cern": (46.2, 6.1),
    "mit": (42.36, -71.09),
    "caltech": (34.14, -118.12),
    "deepmind": (51.53, -0.12),
    "utokyo": (35.71, 139.76),
    "alma": (-23.02, -67.75),
    "meerkat": (-30.71, 21.44),
    "icecube": (-89.99, 0.0),
    "sesame": (32.11, 35.75),
    "tifr": (18.91, 72.81),
    "sydney": (-33.89, 151.19),
    "eth": (47.38, 8.55),
}

ARCS = [
    ("cern", "mit", crimson_mat),
    ("cern", "utokyo", crimson_mat),
    ("cern", "meerkat", silver_mat),
    ("cern", "sesame", silver_mat),
    ("deepmind", "caltech", crimson_mat),
    ("mit", "alma", silver_mat),
    ("utokyo", "sydney", silver_mat),
    ("utokyo", "tifr", crimson_mat),
    ("caltech", "utokyo", silver_mat),
    ("cern", "icecube", crimson_mat),
    ("eth", "tifr", silver_mat),
]

for name, (lat, lng) in HUBS.items():
    p = latlng_to_xyz(lat, lng, 1.012)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.015, location=p)
    b = bpy.context.active_object
    b.name = f"Hub_{name}"
    b.data.materials.append(node_mat)
    set_camera_only(b)
    b.parent = pivot

for idx, (a, b, mat) in enumerate(ARCS):
    p1 = latlng_to_xyz(*HUBS[a], 1.01)
    p2 = latlng_to_xyz(*HUBS[b], 1.01)
    curve_data = bpy.data.curves.new(f"Arc_{idx}", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 0.0036
    curve_data.bevel_resolution = 2
    spline = curve_data.splines.new("POLY")
    steps = 24
    spline.points.add(steps)
    for s in range(steps + 1):
        t = s / steps
        vx = p1[0] * (1 - t) + p2[0] * t
        vy = p1[1] * (1 - t) + p2[1] * t
        vz = p1[2] * (1 - t) + p2[2] * t
        norm = math.sqrt(vx * vx + vy * vy + vz * vz) or 1.0
        lift = 1.01 + 0.19 * math.sin(math.pi * t)
        spline.points[s].co = (vx / norm * lift, vy / norm * lift, vz / norm * lift, 1.0)
    arc_obj = bpy.data.objects.new(f"ArcObj_{idx}", curve_data)
    scene.collection.objects.link(arc_obj)
    arc_obj.data.materials.append(mat)
    set_camera_only(arc_obj)
    arc_obj.parent = pivot

# 4. In Variant B ("pulse"), add glowing expanding Light-Pulse wavefront rings!
pulse_rings = []
if MODE == "pulse":
    ring_mat_1 = make_emit_mat("PulseCrimson", (0.76, 0.16, 0.16, 1.0), 2.8)
    ring_mat_2 = make_emit_mat("PulseSilver", (0.86, 0.88, 0.94, 1.0), 1.9)
    for i in range(3):
        bpy.ops.mesh.primitive_torus_add(
            major_segments=72, minor_segments=10,
            major_radius=1.22 + i * 0.36, minor_radius=0.0042,
            location=(0, 0, 0),
            rotation=(math.radians(72), math.radians(-12), 0)
        )
        ring = bpy.context.active_object
        ring.name = f"LightPulseRing_{i}"
        ring.data.materials.append(ring_mat_1 if i % 2 == 0 else ring_mat_2)
        set_camera_only(ring)
        pulse_rings.append(ring)

# 5. Subtle background starfield specks (pure neutral white/grey)
star_mat = make_emit_mat("StarMat", (0.95, 0.95, 0.98, 1.0), 3.0)
for i in range(55):
    phi = math.acos(1 - 2 * ((i + 0.5) / 55))
    theta = math.pi * (1 + 5 ** 0.5) * i
    r = 18.0
    sx = r * math.sin(phi) * math.cos(theta)
    sy = r * math.sin(phi) * math.sin(theta)
    sz = r * math.cos(phi)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.016 + (i % 3) * 0.006, location=(sx, sy, sz))
    st = bpy.context.active_object
    st.data.materials.append(star_mat)
    set_camera_only(st)

# 6. Studio Solar Key Light + Subtle Silver Rim Backlight
key_data = bpy.data.lights.new("SunKey", type="SUN")
key_data.energy = 4.4
key_data.angle = math.radians(1.5)
key_obj = bpy.data.objects.new("SunKey", key_data)
scene.collection.objects.link(key_obj)
key_obj.rotation_euler = (math.radians(26), math.radians(-16), math.radians(-38))

rim_data = bpy.data.lights.new("RimLight", type="AREA")
rim_data.energy = 140.0
rim_data.size = 4.0
rim_data.color = (0.90, 0.86, 0.88)
rim_obj = bpy.data.objects.new("RimLight", rim_data)
scene.collection.objects.link(rim_obj)
rim_obj.location = (-3.6, 3.2, 2.4)
rim_obj.rotation_euler = (math.radians(115), 0, math.radians(-135))

# 7. Cinema Camera (45mm lens, generous full-Earth framing with smooth orbital dolly)
cam_data = bpy.data.cameras.new("CinemaCam")
cam_data.lens = 45.0
cam_obj = bpy.data.objects.new("CinemaCam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

# Point camera at origin via Track-To constraint
track = cam_obj.constraints.new(type="TRACK_TO")
track.target = pivot
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

# Render sequence
for f in range(NUM_FRAMES):
    t = f / max(1, NUM_FRAMES - 1)
    start_yaw = math.radians(-125 if MODE == "arcs" else -80)
    end_yaw = math.radians(-45 if MODE == "arcs" else 5)
    pivot.rotation_euler = (math.radians(16), math.radians(-6), start_yaw + (end_yaw - start_yaw) * t)

    dist = 5.35 - 0.55 * math.sin(math.pi * t) if MODE == "arcs" else 5.85 - 0.55 * t
    cam_y = -dist
    cam_z = 0.85 - 0.35 * t
    cam_x = -0.30 + 0.60 * t
    cam_obj.location = (cam_x, cam_y, cam_z)

    for idx, ring in enumerate(pulse_rings):
        phase = (t * 1.3 + idx * 0.33) % 1.0
        scale = 0.82 + phase * 1.15
        ring.scale = (scale, scale, scale)

    scene.render.filepath = os.path.join(OUT_DIR, f"frame_{f:04d}.png")
    bpy.ops.render.render(write_still=True)

print(f"BLENDER_DONE mode={MODE} frames={NUM_FRAMES} dir={OUT_DIR}")
