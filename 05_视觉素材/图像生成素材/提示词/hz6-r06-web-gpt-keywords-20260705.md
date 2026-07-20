# HZ-6/R06 网页端 GPT 生图关键词（扩写版）

用途：复制到网页端 GPT / GPT Image，生成 HZ-6/R06 事故卷中 Nikon F 35mm 胶片照片。  
使用方式：每次复制 **A. 全局锁定词** + **B. 单帧 prompt**。如果结果仍然太清楚，再追加 **C. 糊片强化词** 和 **D. 反向约束**。

注意：不要让模型把照片编号、标题、字幕、档案章、水印或说明文字写进画面。编号只用于你管理图片，不应出现在照片里。

## A. 全局锁定词

下面这一段每张都要复制。它负责锁定年代、相机、人物性别、摄影师位置、地形、植被、霜雪覆盖、接触对象和胶片失败方式。

```text
Generate one fictional 1961 black-and-white archival field photograph, shot by Thomas E. Mallory with a Nikon F 35mm SLR, Nikkor-S 50mm f/1.4 lens, Kodak Tri-X Pan ASA 400 film. The image belongs to accident roll HZ-6/R06 from an American Antarctic under-ice survey by the Bureau of Antarctic Survey. It must look like a damaged low-light gelatin silver print scan from the early 1960s, not a modern cinematic still, not a clean restored vintage photograph, not concept art.

Camera and film behavior: manual focus only, no autofocus, no digital stabilization, no instant review. Mallory is cold, frightened, wearing thick gloves, and often has no time to focus, meter, or compose. This must look like a small damaged 1961 field print scanned from an old archive, with low effective resolution and soft optical detail. No object should be tack-sharp, even when it is the focus. Use lens softness, slight missed focus, 1/15 to 1/30 second hand shake for ordinary survey frames, 1/8 to 1/15 second panic shake for accident frames, subject motion blur, partial flashbulb bloom, underexposure, crushed shadows, blown frost highlights, Tri-X grain clumping, chemical fog, water stains, scratches, pressure marks, uneven development, low micro-contrast, soft scan blur, and damaged negative edges where appropriate. Do not create a crisp high-resolution modern image with a vintage overlay.

Location lock: the HZ-6 sample line in the White Abyss, a primitive under-ice twilight conifer layer beneath Antarctica. There is no open sky, no sun, no normal weather. Above is a high, distant, dim ice-and-rock ceiling giving weak grey diffuse light. Treat this as a large under-ice cavity, not a cramped crawlspace. In the Nikon accident-roll images the ice ceiling should read as roughly 12 to 30 meters above the forest floor, never a low roof just above the team. The low black needlewood trees are only 1 to 3 meters tall, so the ceiling must be many times higher than the tree tops. Often the ceiling should be faint, hazy, partly cropped, or visible only in the upper background, not a hard horizontal slab pressing down on the scene. No tree trunk, stump, branch, root, person, radio antenna, route flag, or marker pole may touch, support, pierce, or press against the ice ceiling. The terrain is not a surface forest and not a snowy pine forest. It is a low, ancient, under-ice ecosystem: black primitive conifer-like trunks, horizontal dark branches, ribbed and plate-like root buttresses 20 to 60 cm high, brittle pale frost crust, wet black mineral mud, shallow water film, black trickles, small pale route flags, low weak sample-line marker lights. The ground is uneven; people must step around roots, mud pockets, and shallow water.

Vegetation lock: do not draw a normal green forest. The plants should look ancient, dark, low-energy, and under-ice adapted. The environment is mostly primeval and undisturbed; it should not look logged, burned, smashed, or recently damaged. Real-world analogies are only visual references, not exact species: stunted black spruce or krummholz at an alpine tree line; bald cypress knees and buttress roots; mangrove-like prop roots; horsetail-like segmented stems; seed-fern or cycad-like stiff primitive fronds in small patches. Main plant type is "black needlewood": short thick living trunks 1 to 3 meters tall, oily black bark, sparse dark needles or scale-like leaves, horizontal branch fans, exposed plate roots and root knees, frost-rimmed root ribs. The trees are low, but they are not ceiling pillars; show a large volume of dark empty space above the upper branches before the high ice roof. Vegetation density changes along the route. Near HZ-6A and the first walking frames, the forest is sparse and open, with isolated low trunks and wide frost-white gaps. In the middle section, root plates and low trunks become more frequent. Near HZ-6C and the contact frames, the low forest becomes cramped and dense at ground level, with more living black trunks, tangled root ribs, obstructed sightlines, and less visible open ground, but the overhead cavity remains high. Secondary vegetation is rare and should occupy very little of the frame: a few dark waist-low segmented stems or hard fern-like fronds near water and roots. Do not make plant mats or carpets. No flowers, no lush leaves, no bright green grass, no mushrooms, no fungal carpet, no clubmoss carpet, no mossy fantasy ground.

Snow and ground coverage lock: this is not deep surface snow. Use hoarfrost, rime, thin granular ice dust, and brittle pale frost crust instead of fluffy snow. Ground color changes by route depth. Near the entrance and early HZ-6A frames, the visible ground is mostly pale frost and thin snow crust, about 70 to 90 percent white, with only occasional black mineral mud, wet root plates, and broken boot tracks exposed. In the middle section, white frost drops to about 45 to 65 percent, with more black root ribs, mud pockets, and shallow water. Near HZ-6C and the contact frames, white frost drops to about 20 to 45 percent; the ground becomes darker, wetter, more root-choked, and more disturbed. Frost remains thin and brittle, usually on raised edges, not fluffy. Footsteps break the frost crust and reveal black mud underneath. Flash can make nearby frost look almost white, but the scene should still show the correct route-depth gradient.

Plant growth state lock: the vegetation is alive, primeval, and extremely slow-growing. It should look old, primitive, stunted, partly mineral-stained, and damp, but not ruined. Branch tips may carry pale frost beads. Needles are sparse and dark, not lush. Most trunks are intact living growth with dark wet bark; scars, mineral crusts, or dead tips should be subtle and occasional. Do not turn the forest into a field of snapped stumps, jagged broken wood, rotten logs, burned trunks, or clear-cut remains. Roots spread above the ground as ribs, knees, and plates because the soil layer is thin and waterlogged. The forest floor is cramped and uneven, with plants growing naturally around mud pockets, shallow trickles, and frost-cracked mineral crust.

Ground realism lock: the white ground texture is broken frost crust and granular ice dust, not coral, not lichen, not reindeer moss, not sea sponge, not decorative branching plants. Frost clumps should be low and brittle, usually 1 to 3 cm tall, scattered on raised edges and broken by boots. Show field disturbance only where people have passed: crushed frost, boot prints exposing black mud, smeared mud edges, shallow puddles, wet footprints, small stones, and sample-line scuffs. The wider ecology should remain naturally grown and mostly undamaged. Root plates should be uneven and functional, not perfectly repeated sculptural waves and not chopped stump fields. Avoid beautiful ornamental ground patterns.

Team gender and appearance lock: do not show concrete facial features for any team member. Everyone wears 1961-appropriate cold-weather face covering: wool balaclava, frost-caked scarf or wind mask over the mouth and nose, fur-trimmed hood, and goggles or frost-clouded glasses when visible. Faces are hidden by cloth, frost, hood shadow, motion blur, or rear angle; no clear eyes, nose, mouth, jawline, skin detail, hair, or portrait-like face. Gender and role should be readable only through body scale, clothing, equipment, posture, and task. The HZ-6 team has five people. Lt. Howard P. Rusk is male, the tallest and broadest man, late 30s or early 40s, dark heavy canvas polar parka, fur-trimmed hood, military posture, route board, compass case, map pouch, thick gloves, and an M1 carbine as lead security. Sgt. Daniel Keene is male, slimmer, late 20s or early 30s, dark polar coat, bulky AN/PRC-10 style radio pack, handset, cables, spare battery pouch, often turned toward the relay direction. Dr. Helen M. Klein is female, mid-30s, shorter, mid-gray polar parka, frost mask or scarf, goggles or frost-clouded glasses, sample pouches, wax-paper sample bags, small metal sample box, often crouching or near the ground. Thomas E. Mallory is male, early 30s, the photographer, normally fourth in the line and usually not visible except as a gloved hand, sleeve edge, boot, or camera strap edge. Petty Officer Second Class Samuel R. Vance is male, late 20s or early 30s, stocky but shorter than Rusk, dark navy-issue polar parka, rear security posture, second M1 carbine on a sling, flare pouch or small first-aid pouch, normally fifth at the rear of the line. Do not merge the team into generic androgynous explorers, but do not use visible faces to identify them.

Photographer position lock: Mallory is normally fourth in a five-person line, not the last man. The ordinary order is Rusk first, Keene second, Klein third, Mallory fourth with the Nikon, and Vance fifth as rear guard. Normal walking photographs made by Mallory should usually show three people ahead of him from behind, three-quarter rear, or rear-side: Rusk, Keene, and Klein. Vance is behind Mallory and usually does not appear in forward-facing survey frames; if he appears, it is only as an edge fragment, gun sling, boot, shoulder, shadow, or blurred rear presence. Do not place the camera ahead of the team looking back at their faces unless a specific frame says Mallory stepped aside for a sample shot. Camera height in ordinary frames is chest to eye level, 1.3 to 1.6 meters; in accident frames it drops to waist, knee, or ground level. With a 50mm lens, avoid ultra-wide dramatic perspective.

Survey documentation lock: ordinary pre-incident frames are practical scientific field records, not art photographs. The main subject should be the team performing a task: walking the transect, checking a route board, radio, sample box, or sample surface. Route flags are small scale markers only; they should never become the hero subject, never sit perfectly centered in the foreground, and never be the sharpest or most dramatic object unless a specific frame asks for route evidence. Avoid low-angle macro compositions, perfect foreground bokeh, cinematic depth of field, and decorative landscape shots. Compose like a tired field photographer making routine evidence photos with a 50mm lens.

HZ6-CO-01 contact object lock: keep the same animal across all frames, but never reveal it clearly. The following anatomy is only a consistency guide, not something the photo should display cleanly. It is a large primitive under-ice animal, not a demon, not a humanoid monster, not a mushroom or fungus, not a modern cryptid design. Approximate full size if it were visible: body length 2.4 to 2.8 meters, shoulder height 0.9 to 1.15 meters, low and heavy, roughly 250 to 400 kg. It moves close to the ground between root plates. Body plan, mostly hidden: broad low shoulders, elongated torso, lowered head carried below the shoulder line, heavy forelimbs slightly longer than the hind limbs, plantigrade or knuckle-like forefoot contact, a bent forelimb angle that can look uncomfortably human for a second but is still animal anatomy. Surface, only glimpsed: wet black-gray hide or very short soaked bristles, sparse stiff dorsal bristles along the spine, occasional pale scuffed patches, frost and water catching flash as narrow highlights. In actual generated photographs it must be less readable than the people and terrain. It may only appear as a blurred low dark interruption behind root plates, a cropped wet edge entering the frame, an unreadable wet glare at the edge of a water film, a smeared shoulder/back highlight, or one partial motion-blurred forelimb-like streak. No clear eyes, no clear teeth, no dramatic claws, no antlers, no tentacles, no upright posture, no human face, no complete torso, no complete animal silhouette, no full-body reveal.

Composition lock: this is field evidence, not a posed horror poster. No gore. No heroic action composition. No modern tactical gear. No phones, GPS, LED lights, computers, digital night vision, clean logos, readable labels, captions, subtitles, watermarks, or decorative typography.
```

## B. 单帧 Prompt

每张复制：**A. 全局锁定词** + 下方对应帧。  
当前精选生成清单固定为 **20 张**：前期正常科考、首次发现未知生物、未知生物袭击、队员被袭击后的慌乱糊片。**不再生成袭击后的水边残留线索、黑湖倒影或片尾证据照**；设定上马洛里在袭击混乱中已经把 Nikon 这一卷快门用完，之后抵达黑湖支流的过程只由救援报告和口供交代。

每个单帧 prompt 里已经写了对焦点、虚焦方式、接触对象可见程度、人物和地形约束。全局段落里的植被、霜雪覆盖、人物遮面和胶片失败规则适用于所有帧，不要让网页端把它替换成普通松林、大雪地或清晰露脸肖像。

### BAS-HZ6-R06-F01

```text
Frame BAS-HZ6-R06-F01. Time 1240, before the incident. A planned walking record, horizontal 35mm frame. Mallory photographs from the fourth position in the line, slightly left or right of center, about 3 to 7 meters behind the first three team members at chest height. Rusk, Keene, and Klein move away from the camera in loose single file along the HZ-6 sample line. Rusk is first, male, tall and broad, dark fur-hood parka, route board or compass case, M1 carbine carried low or slung, seen from the back or three-quarter rear. Keene follows, male, slimmer, bulky radio pack forming a rectangular back silhouette, cable or handset visible near one shoulder. Klein is third, female, shorter, mid-gray parka, sample pouches or small sample box visible, seen from the back or side-back. Vance is behind Mallory as rear guard and should usually be outside the forward frame; if visible at all, only a soft edge of dark shoulder, gun sling, or boot appears at the extreme border. This is still near the open HZ-6A entrance side of the sample line: the low black needlewood trunks are sparse and separated, with a tall dark overhead volume above them before the high distant ice ceiling. If the ceiling appears, it is only a faint grey roof texture high in the upper background, many meters above the team, not a low slab. The visible ground is mostly pale frost and thin snow crust, about 75 to 90 percent white, broken by occasional black mineral mud, root ribs, boot tracks, and shallow wet patches. The primitive under-ice terrain should be visible but secondary: black ribbed root plates crossing the path, brittle white frost crust broken by boots, and a few small pale route flags far to the side as scale markers only. Do not center a route flag in the foreground. No HZ6-CO-01 visible.

Focus point: intended focus is approximate, on the backs of the forward three people, especially Keene's radio pack and Rusk's route gear at middle distance, about 4 to 7 meters away. The whole frame is modestly soft because of low light, lens softness, and old print scanning; no foreground object should be crisp. Blur style: mild hand shake at 1/30 second, low contrast, soft edges, coarse Tri-X grain, no flash or only very weak fill, grey under-ice light. The frame should feel like a routine survey walking record from the fourth position, not a clear expedition portrait and not an artistic foreground-flag composition.
```

### BAS-HZ6-R06-F02

```text
Frame BAS-HZ6-R06-F02. Time 1240, before the incident. A planned sample-location record. Mallory has stopped behind and slightly to one side of Klein at chest height, documenting her work, not making a macro shot of a marker. Dr. Helen M. Klein is female, shorter than the men, crouched beside a black root plate, seen in side view or three-quarter rear view while checking frost crystals and root edge texture. She wears a mid-gray polar parka, hood up, wool balaclava or frost-caked scarf covering her face, goggles or glasses fogged with frost, sample pouches at her side, thick gloves awkward around a small tool, notebook card, or wax-paper sample bag. No concrete facial features are visible. The sample point is still in the sparse outer part of the low forest: isolated black trunks, a broad pale floor, and a high overhead cavity. The ice ceiling should not visually crowd the crouching figure; if visible at all, it is far above and soft. The ground is visible as task context: mostly thin white frost crust and granular ice dust, crushed by boots, with black wet mineral mud showing only in cracks, root edges, and shallow puddle margins. Small fragments of white shell or old bone may appear only if subtle. A route flag or sample marker may exist off-center and soft, but it must not dominate the image. No animal visible.

Focus point: intended focus is approximate, on Klein's gloved hands, small tool, and the sample surface immediately in front of her, about 2 to 3 meters from the lens. The sample marker and foreground frost are softer than the work area. Blur style: slow careful handheld shot, slight focus breathing, edge softness, mild underexposure, faint chemical fog, low effective scan resolution. It should look like a field technician doing work, not a portrait and not a flag close-up.
```

### BAS-HZ6-R06-F03

```text
Frame BAS-HZ6-R06-F03. Time 1819, after the knocking sounds stop. Mallory is still in the fourth position between the forward three and the rear guard; he raises the Nikon without orders and photographs past the team's path toward the darker inner tree line. The picture should contain almost no obvious subject: a moderately denser band of black primitive conifer trunks, low horizontal branches, ribbed root plates, dark gaps between roots, pale frost on root edges, wet mud, one dim sample-line marker light far off. The ground is no longer a clean white floor; roughly half of it is still pale frost crust, while black roots, mud, and shallow water interrupt it in irregular patches. The ice ceiling is visible only as a distant dim roof high above the forest, with a tall vertical air volume above all tree tops. If a person edge appears, it should be only a cropped shoulder, radio pack, sample box edge, or rear-guard shoulder at the frame side, not a posed figure. No HZ6-CO-01 visible as a readable body. The fear comes from photographing an empty place that later matters.

Focus point: no strong focus target; Mallory makes a quick, uncertain record of the tree line. Mid-distance root plates and dark trunk bases are only marginally more legible than the rest. Avoid a sharp foreground subject. Blur style: underexposed available-light frame at about 1/15 second, no flash, slight vertical hand tremor, crushed shadows, grey fogged highlights, heavy grain in the dark areas, low scan resolution. Keep the frame quiet and empty, not theatrical.
```

### BAS-HZ6-R06-F04

```text
Frame BAS-HZ6-R06-F04. Time 1822, first non-planned flash. Mallory is behind and slightly off the sample line. Rusk turns sharply toward the dark tree line, seen from rear-side rather than front portrait. The camera is low and tilted, as if Mallory raised it too late. Rusk's broad male build, dark parka and fur hood dominate one side; his face is covered by a wool balaclava or frost scarf, goggles, hood shadow, and motion blur. Do not show his eyes, nose, mouth, jawline, or skin. This part of the line is more crowded than the entrance: low black trunks and root buttresses are closer together, sightlines are broken, and only 35 to 50 percent of the ground remains white frost. Behind Rusk, partly hidden between root plates, HZ6-CO-01 is only barely recorded for the first time: not a creature portrait, only a low dark motion-smear with one wet highlight and perhaps one bent forelimb-like streak near the ground. It must be partially cropped or broken by roots, more blurred than Rusk, and impossible to identify cleanly. No head, no eyes, no teeth, no full body, no readable torso.

Focus point: focus remains on Rusk's parka edge or a foreground root plate around 2 meters away. HZ6-CO-01 is farther back and heavily out of focus. Blur style: flashbulb bloom blasts the frost crust white, while the background drops black. Rusk's turn creates lateral motion blur; the contact object's outline is broken by root plates and flash glare. The image must be evidence-like: frightening only because something low and consistent is barely there.
```

### BAS-HZ6-R06-F05

```text
Frame BAS-HZ6-R06-F05. After 1712, during the return decision. Mallory photographs from behind or rear-side while Rusk checks a route board, compass, or sample-line marker as the team prepares to return to HZ-6A. Rusk is male, tall and broad in a dark parka, military posture, gloved hands near a route board or compass case, seen mainly from side-back. The route is in the middle-density part of the low forest: black conifer roots surround him like low barriers, but the trunks remain far below the high ice ceiling with a large dark space above. The ground is mixed, roughly half white frost crust and half exposed black mud, root ribs, wet stone, and shallow water. Route flags continue into dimness as small side markers. Marker lights are weaker than expected. No HZ6-CO-01 visible. No dramatic attack pose.

Focus point: the intended focus is Rusk's route board, compass case, and gloved hands at middle distance. Any route flag or marker stake remains peripheral and soft. His hood, shoulder, and hands are not tack-sharp. Blur style: available-light exposure around 1/30 second, gloomy but still usable, mild hand shake, soft edge falloff, low contrast, coarse grain, old print scan softness. This should look like a practical return-route record that became important later.
```

### BAS-HZ6-R06-F06

```text
Frame BAS-HZ6-R06-F06. Around 1824, before full contact. Mallory is behind Keene or slightly rear-side. Keene is male, slim under a dark polar coat, standing partly turned toward the HZ-6A relay direction, one gloved hand near a handset, cable, or radio pack strap. The bulky AN/PRC-10 style radio backpack is the main identifier, viewed from the back or three-quarter back. The radio pack should be period-appropriate: boxy, heavy, canvas straps, wire or coiled cable, no modern antenna design. Background: denser low black needlewood than the entrance, more root plates, frost crust broken into islands, wet black mud, one small route flag, dim marker light, and a high overhead void before the distant ice roof. No HZ6-CO-01 visible as a clear form.

Focus point: the accidental focus is on the radio handset, cable loop, or shoulder strap, about 1 meter from the lens. Keene's face is covered by a cold-weather mask, hood, and goggles or scarf, then lost behind the focus plane and smeared by his partial turn. Blur style: weak low-light shot, 1/15 to 1/30 second, slight diagonal hand shake, grainy shadows, no clean contrast. Make it identifiable as radio evidence, not a character portrait.
```

### BAS-HZ6-R06-F07

```text
Frame BAS-HZ6-R06-F07. After HZ-6C and before the attack. Mallory is behind or slightly side-rear as Klein carries or checks the small sample box after removing the filter box. Klein is female, shorter than the men, in a mid-gray parka, hood, face scarf or balaclava, and goggles, one shoulder cropped, seen from the side or three-quarter rear. The sample box and sample pouches are more important than any face; do not show facial features. Surrounding terrain: the inner low forest is becoming dense at ground level, with more black root plates, short trunks, horizontal branch fans, cracked frost crust, wet mineral mud, and small depressions filled with thin dark water. White frost is now only partial, mostly on raised roots and boot-scuffed patches, not a continuous snow floor. The ice ceiling remains high and distant, not touching or pressing down on the trees. No animal visible.

Focus point: focus lands on the sample box latch, metal edge, or frost stuck to the box corner at about 0.8 meters. Klein's body is soft and partly cropped; her covered face is not a subject. Blur style: handheld documentary shot, slight downward angle, edge softness, faint water stain and scratches in the scan, underexposed background. The image should say "sample evidence," not "posed scientist."
```

### BAS-HZ6-R06-F08

```text
Frame BAS-HZ6-R06-F08. Around 1829, closer and worse contact exposure. Mallory has dropped low among root plates from the fourth position as the five-person line begins to collapse. A blurred edge of Rusk's dark parka or shoulder may be in the foreground, seen from behind or side-back. Vance may appear only as a dark rear-edge fragment, sling, boot, or blocked shoulder if the camera swings, never as a centered figure. Beyond the foreground, in the dense inner low forest, a 40 to 60 cm high black root buttress blocks most of the view. HZ6-CO-01 is present only as evidence, not a reveal: a broad low dark smear behind the root, one wet black-gray highlight dragged by motion, and perhaps a partial forelimb-like blur near the ground. It must remain the same scale as F04, bigger than a dog and lower than a standing man, but the viewer should not be able to trace a full body. No clean shoulder, no clear torso, no head, no eyes, no teeth, no full-body view.

Focus point: the sharpest accidental focus is the foreground root plate or Rusk's parka seam at 0.8 to 1.5 meters. HZ6-CO-01 is behind the focus plane and further smeared by motion. Blur style: flashbulb bloom overexposes frost in the lower frame, background drops into crushed black, subject motion streaks left-to-right. This is not a monster reveal; it is a damaged contact frame.
```

### BAS-HZ6-R06-F09

```text
Frame BAS-HZ6-R06-F09. Waste frame after contact. Flash misfire or weak flash. Almost the whole image is the dense inner ground layer: underexposed root plates, wet black mineral mud, broken islands of pale frost crust, shallow water, and one small route flag reduced to a white blur near a side or lower edge. The frame should feel darker and less snowy than the entrance frames. A dragged line or disturbed smear crosses the frost, suggesting fast movement or someone stumbling. No clear person. HZ6-CO-01 should not be visible except maybe a vague dark interruption behind roots that cannot be classified as an animal.

Focus point: no reliable focus; the nearest readable details are scraped frost, broken mud edge, and root texture about 1 meter away. If a route flag appears, it is soft and off-center. Blur style: severe underexposure, grain clumping in shadows, mild camera shake, weak flash falloff, muddy blacks, scan softness. It should look like a mostly failed frame that only becomes useful when studied.
```

### BAS-HZ6-R06-F10

```text
Frame BAS-HZ6-R06-F10. Waste frame after contact. Violent diagonal motion blur from Mallory stumbling or being shoved. The frame should be mostly streaks: patches of blown white frost, black root ribs, a flash glare stripe, wet mud, and shallow water dragged into diagonal bands. Because this is deep on the sample line, the white areas are broken and interrupted by dark ground, not a clean snowfield. Inside one dark diagonal smear, there may be the same HZ6-CO-01 wet edge or low back highlight, but it must remain fragmentary, cropped, and unreadable. Do not form a complete animal silhouette or a clear monster shape. No readable faces.

Focus point: essentially missed; if anything is slightly legible, it is a root plate edge or frost ridge crossing the frame diagonally. Blur style: 1/8 to 1/15 second hand swing, rolling body movement, flash smear, shallow depth of field, pressure mark near one edge. The viewer should first read it as a ruined photograph, then notice that one dark shape may match F04 and F08.
```

### BAS-HZ6-R06-F11

```text
Frame BAS-HZ6-R06-F11. Waste frame after contact, camera close to the ground as Mallory falls. Include a blurred boot heel or boot side at one frame edge, torn brittle frost crust, wet black mineral mud, a ribbed root plate very close to the lens, and a dark moving edge at the opposite border. The dark edge may be HZ6-CO-01 passing close, but it cannot show a face or full limb. Keep it animal-scale and low, not upright.

Focus point: the lens is too close for comfort; the sharpest readable area is a frost patch or root texture around 0.6 to 0.8 meters away, while the boot heel and dark edge are soft. Blur style: low-angle fall, oblique horizon, heavy hand shake, partial flash, blown frost highlights, black mud crushed into shadow, scratches and grit. The image should feel like an accidental shutter press during impact.
```

### BAS-HZ6-R06-F12

```text
Frame BAS-HZ6-R06-F12. Low running frame used later to reconstruct Mallory's direction. Camera height near knee level, tilted downward along the sample line. Visible evidence: one pale route flag, broken boot tracks, smeared frost crust, black wet mud, root plate ribs, a possible boot edge at the lower border. No clear person. No HZ6-CO-01 visible. The path should show that the photographer is leaving the line or stumbling across it, not calmly walking.

Focus point: no stable focus; the most legible information is the disturbed path as a whole: boot tracks, scraped frost, mud, and root ribs across the lower half of the frame. A route flag may appear as a soft side marker, not a centered hero object. Foreground boot edge and distant roots are motion-blurred. Blur style: 1/15 second running shake, slight horizontal smear, underexposed background, grey frost overexposed in patches, rough Tri-X grain, low scan resolution. The frame should be route evidence, not an action photograph.
```

### BAS-HZ6-R06-F14

```text
Frame BAS-HZ6-R06-F14. Waste frame caused by cold mechanical over-advance or partial film jam, not supernatural double exposure. The image contains overlapping or compressed bands: black root plates, a mid-gray sleeve that may be Klein's, a sample box corner, pale frost, and one dark moving mass squeezed near an edge. If HZ6-CO-01 is implied, keep it to the same low wet shoulder/back ridge or dark mass shape, partially blocked by root plates. No clear animal, no readable face.

Focus point: unreliable because of film transport damage. The clearest fragments are the sample box corner and one root rib; everything else is dragged or doubled by mechanical misregistration. Blur style: partial frame overlap, pressure streak, uneven exposure band, motion smear, cold-stiff film handling marks, low contrast scan. It should look physically plausible as a bad 35mm frame.
```

### BAS-HZ6-R06-F16

```text
Frame BAS-HZ6-R06-F16. Panic frame during the attack, before Mallory has left the sample line. The camera swings partly backward and sideways from Mallory's fourth position as the five-person formation collapses. Vance, the rear guard, may be present only as a dark navy parka shoulder, a second M1 carbine sling, or a cropped boot at the extreme edge, never a centered heroic figure. Keene's radio cable or pack corner may cut through the middle of the frame, while Rusk's dark shoulder or route board edge is blurred in the opposite direction. The low forest is dense at ground level: living black needlewood trunks, tangled root ribs, broken frost crust, wet black mud, and shallow water patches. HZ6-CO-01 may be suggested only as a low dark smear behind roots near the lower background, more blurred than everything else. No clear body, no head, no eyes, no claws, no human-like face.

Focus point: missed. The most legible plane is a radio strap, rifle sling, or root rib at about 0.8 to 1.2 meters, but even that is soft. Blur style: 1/8 second rotational hand shake, flashbulb falloff, subject motion, crushed blacks, blown frost fragments, rough grain, scan scratches. The frame should prove that the rear guard was still close to Mallory during the collapse, without clearly explaining what happened.
```

### BAS-HZ6-R06-F17

```text
Frame BAS-HZ6-R06-F17. Panic frame as the roll is being used up during the attack. Mallory fires the shutter while stumbling among root plates. The image should be mostly unreadable but not completely black: a slanted burst of overexposed frost, a dark gloved arm, a fragment of Klein's sample box or pouch, a radio cable, and a low black root buttress cutting across the frame. One team member may be falling or bracing, but only as a cropped covered shoulder, elbow, or knee; no face, no clear pose, no gore. HZ6-CO-01 is not shown clearly. If it appears at all, it is only a wet black-gray edge or moving shoulder-back highlight partly swallowed by flash bloom and motion blur.

Focus point: accidental focus lands on nothing useful; the nearest readable details are broken frost crust and a root edge about 0.6 to 0.9 meters from the lens. Blur style: panic shake, partial flash misfire, uneven exposure, chemical fog, pressure marks, heavy Tri-X grain, low scan resolution. This is one of the last exposures made during the attack, not a later escape or water-side clue.
```

### BAS-HZ6-R06-F18

```text
Frame BAS-HZ6-R06-F18. Waste frame after contact, lens fog or condensation. A pale milky bloom covers much of the frame. Through the fog, black primitive conifer branch shadows and root plates cut across the image. Along one side, there is a long forelimb-shaped blur that could belong to HZ6-CO-01: thick near the shoulder, tapering toward a plantigrade or knuckle-like contact point, low to the ground. It must remain a shape association, not a readable limb, hand, claw, or monster arm.

Focus point: ambiguous and mostly lost to condensation. The most readable details are branch shadows and a root edge breaking through the fog. Blur style: wet lens flare, chemical fog, low contrast, diffuse flash bloom, 1/8 to 1/15 second shake, water stain artifacts. Keep the animal information hidden in the haze.
```

### BAS-HZ6-R06-F21

```text
Frame BAS-HZ6-R06-F21. Restricted frame during 1831-1836. Klein is either falling, crouching, or trying to protect the sample box beside black root plates. The action must be ambiguous, not theatrical. Her mid-gray parka, face scarf or balaclava, goggles or hood, thick gloves, sample pouches, and small metal sample box are visible in fragments. Background may contain dark movement behind the roots, but HZ6-CO-01 is not readable; if present, it is only a low shadow or wet edge matching the same animal scale.

Focus point: the accidental focus is on the sample box edge, glove, and frost crust about 0.8 to 1.2 meters from the lens. Klein's covered face is turned away, hidden by hood and motion, and never readable. Blur style: camera moving backward or sideways, shallow depth of field, flash bloom on frost, crushed black roots behind her, coarse grain. It should feel like evidence of a fall or collapse, not a staged attack still.
```

### BAS-HZ6-R06-F22

```text
Frame BAS-HZ6-R06-F22. Waste frame after contact. A close accidental crop: the corner of Klein's small metal sample box, a thick glove, and a short section of route rope or strap crossing brittle frost and wet black mud. The crop is too close and overexposed in places. No clear face, no full person, no HZ6-CO-01. The picture hints the sample box was dropped or grabbed later but does not prove it.

Focus point: the closest readable plane is the sample box corner or glove seam at about 0.6 to 0.8 meters. Some parts are too close and soft. Blur style: partial flash overexposure, heavy grain, shallow focus, diagonal hand shake, edge scratches, slight negative pressure mark. Make it look like a useless close crop that later became inventory evidence.
```

### BAS-HZ6-R06-F24

```text
Frame BAS-HZ6-R06-F24. Restricted accident crop during 1831-1836. Most of the frame is black root plates, frost crust, mineral mud, and flash glare. In the upper right corner only, a blurred wet shining surface appears. It should be consistent with HZ6-CO-01: wet black-gray hide or very short soaked bristles, a curved shoulder or flank surface, narrow flash highlight, maybe a few stiff dorsal bristles. But it must remain cropped, out of focus, and ambiguous. It could be hide, shell-like wet skin, soaked fur, or flash reflection. No head, eye, teeth, claws, or full body.

Focus point: the foreground root plate and frost crust are the clearest plane. The wet surface is outside the focus plane and partly blown by flash. Blur style: accidental crop, uneven flash, low exposure latitude, chemical stains, scan softness. It is not a creature close-up; it is a bad frame with one troubling corner.
```

### BAS-HZ6-R06-F25

```text
Frame BAS-HZ6-R06-F25. Waste frame after contact. The image cuts diagonally across the backside of a black conifer root plate and a cropped wet shining edge. This wet edge should echo F24 and the same HZ6-CO-01 surface: black-gray, slick, low to the ground, possibly bristled along a ridge, but too cropped to classify. No clear person. No readable animal anatomy. Terrain still matters: frost powder on root ribs, black mud in the low gaps, one muddy smear suggesting fast movement.

Focus point: focus falls on a root rib or frost ridge around 0.7 to 1 meter from the lens. The wet edge is either too close or too far and remains soft. Blur style: diagonal motion, partial flash, underexposed corners, film scratches, uneven development. This should be less useful than F24 but visually connected to it.
```

## C. 糊片强化词

如果网页端 GPT 生成得太清楚，把下面这段追加到 prompt 最后：

```text
Make the image more physically failed and less legible. It should look like a bad 1961 low-light 35mm field photograph scanned from a small old gelatin silver print, not a modern high-resolution image with a vintage filter. Lower the effective detail resolution across the whole frame. No tack-sharp foreground object. No crisp route flag. No crisp roots. No clean fabric texture. Use soft lens resolution, slight missed manual focus, shallow but messy depth of field, 1/15 second hand shake for ordinary frames or 1/8 second panic shake for accident frames, flashbulb misfire, uneven flash falloff, underdevelopment, chemical fog, water-stained print scan, pressure marks, damaged negative edge, clumped Tri-X grain, soft scanner blur, and low micro-contrast. Faces must be unreadable. HZ6-CO-01 must remain only a consistent low animal-like fragment or damaged blur, never a clear creature.
```

## D. 反向约束

如果模型总是生成“电影剧照”“清晰怪物”“现代复古滤镜”，追加：

```text
Avoid: clean horror movie still, cinematic monster reveal, sharp creature design, clear monster face, clear eyes, teeth, claws, full-body creature, complete animal silhouette, readable animal torso, upright humanoid monster, demon, alien, fungus creature, mushrooms, fungal carpet, coral-like frost, lichen carpet, reindeer moss carpet, sea-sponge ground texture, decorative branching white ground cover, repeated sculptural root waves, forest of snapped stumps, cut stumps, jagged broken trunks, clear-cut forest, burned forest, battlefield destruction, tree trunks touching the ice ceiling, branches supporting the ice roof, ice ceiling pressing down onto tree tops, low crawlspace ceiling, cramped ceiling just above the team, tunnel roof only a few meters overhead, tentacles, antlers, gore, heroic action composition, normal green pine forest, ordinary snowy forest, fluffy deep snowfield, lush grass, ambiguous generic explorer gender, front-facing posed expedition portrait, camera placed in front of the team, modern camera quality, digital noise, night vision, LED flashlight, tactical gear, phones, GPS, computers, readable labels, captions, logos, watermark, polished retro filter, beautiful concept art, studio lighting, high dynamic range, clean documentary photography.
```

## E. 针对“地面不真实 / 性别混乱 / 机位错误”的修正补丁

如果网页端已经生成出“珊瑚状地面”“人物性别不清”“像摄影师站在队伍前方”的图，把下面这段直接追加到原 prompt 后再生成：

```text
Correction pass: make the scene more physically believable as a 1961 field photograph. The white material on the ground must be thin broken frost crust, granular ice dust, and rime on raised roots, not coral, not lichen, not reindeer moss, not sea sponge, not branching decorative ground cover, not a fungal mat. Keep frost low and brittle, usually 1 to 3 cm tall. Add crushed frost, black mud exposed by boots, wet boot prints, shallow puddles, small stones, scraped route marks, and irregular root damage. The black root plates must look naturally grown, uneven, muddy, and functional, not repeated sculptural waves.

Keep team roles and gender consistent, but do not identify anyone through a visible face. All team members wear 1961-appropriate cold-weather face coverings: wool balaclavas, frost-caked scarves or wind masks, fur hoods, and goggles or frost-clouded glasses. No clear eyes, nose, mouth, jawline, skin detail, hair, or portrait-like face. Rusk is male, tall and broad, identified by route gear, M1 carbine, and military posture. Keene is male, slimmer, identified by the radio pack and cables. Klein is female, shorter, identified by sample pouches and a small sample box. Mallory is male and is the photographer, normally fourth in the five-person line. Vance is male, stocky, rear guard, identified by a dark navy parka, rear-security posture, and second M1 carbine sling. Do not make the visible figure an ambiguous generic explorer unless the frame specifically hides all identity.

Camera placement correction: Mallory is normally fourth, not last. Normal walking photos should be shot forward from Mallory's fourth position and usually show the three people ahead of him: Rusk, Keene, and Klein. Vance is behind Mallory as rear guard and should not become the main subject unless a frame explicitly turns back or breaks formation. Do not place the camera in front of the team looking back at their faces. Do not make a posed portrait.
```

## F. 针对“旗子抢焦 / 不像科研调查 / 太高清”的修正补丁

如果网页端把旗子、前景根板、漂亮地貌当成主角，或者照片太像高清游戏概念图，把下面这段追加：

```text
Scientific survey correction: this is a practical field record, not an atmospheric landscape. The main subject must be the survey task: people walking the transect, checking instruments, handling a sample box, using a radio, or examining a sample surface. Route flags are only small side markers for scale and direction. Do not center a flag in the foreground. Do not focus on a flag. Do not make a flag the cleanest or most dramatic object. Do not use low-angle macro composition or cinematic foreground bokeh.

Era and clarity correction: make it look less like a modern render. Simulate a small 1961 black-and-white field print scanned decades later. Lower the effective resolution. Add optical softness, flat grey contrast, uneven exposure, muddy shadow detail, print grain, scanner softness, and slight hand shake. No element should be perfectly sharp, including roots, flags, clothing, tools, or faces.
```

## G. 针对“树顶冰层 / 雪面比例 / 林地密度 / 接触对象太具象”的修正补丁

如果网页端把树画到顶住冰层、地面黑白比例混乱、林地始终一样稀疏，或者把 HZ6-CO-01 画成清晰怪物，把下面这段追加：

```text
Under-ice spatial correction: the ice ceiling is a high distant roof of a large under-ice cavity, not a low crawlspace ceiling. In these Nikon accident-roll photographs, read the ceiling as roughly 12 to 30 meters above the forest floor, or so high that it is only a faint upper-background texture. The low black needlewood trees are only 1 to 3 meters tall, so there must be a tall vertical volume of darkness above the trees. No trunk, branch, stump, root, person, radio antenna, route flag, or marker pole may reach, touch, pierce, or support the ice ceiling. Do not make the ice roof hang only a few meters above the team. The trees are low under a high cavity, not pillars holding up ice.

Ground progression correction: match the route depth. Early HZ-6A entrance frames should be mostly white on the ground, about 70 to 90 percent thin frost crust and granular snow dust, with occasional black mud, root ribs, boot damage, and shallow water. Middle frames should be mixed, about 45 to 65 percent white frost with more black root plates and wet mud. HZ-6C and contact frames should be darker and wetter, about 20 to 45 percent white frost, with dense black roots, mud pockets, shallow black water, and disturbed boot tracks. The white material is thin frost crust, not fluffy snow.

Vegetation progression correction: the route starts sparse and open, then becomes denser. Early frames show isolated low trunks and broad frost-white gaps. Middle frames show more root plates and low trunks. Contact frames show a cramped low forest with broken sightlines, more black root buttresses, horizontal branch fans, and less open ground. Do not keep the forest equally sparse in every frame.

Contact object correction: HZ6-CO-01 must not be a clear animal picture. It is the same large low under-ice animal across frames, but in the photos it is only barely recorded: a cropped wet edge, a low dark smear behind roots, an unreadable wet glare at the edge of a water film, a motion-blurred back highlight, or a partial forelimb-like streak. It must be more blurred than the people and terrain. Do not show a complete body, readable torso, clear head, eyes, teeth, claws, or a clean silhouette. The viewer should only be able to suspect that the same low animal is present.
```

## H. 针对“人物露出具体面部”的修正补丁

如果网页端把队员画成清晰露脸的探险者，把下面这段追加：

```text
Face covering correction: do not show concrete facial features for any team member. Every visible team member wears 1961-appropriate cold-weather face covering: wool balaclava, frost-caked scarf or wind mask over the mouth and nose, fur-trimmed hood, and goggles or frost-clouded glasses. Faces are hidden by cloth, frost, hood shadow, rear angle, missed focus, motion blur, or underexposure. No clear eyes, no nose, no mouth, no jawline, no skin texture, no hair, no portrait-like face. Identify people only by body shape, equipment, posture, and task: Rusk is the tall broad route leader with route board or compass case and M1 carbine, Keene is the slimmer radio man with the bulky AN/PRC-10 pack and cables, Klein is the shorter scientist with sample pouches and the small metal sample box, Mallory is the male photographer normally fourth in line, and Vance is the stocky rear guard with a second M1 carbine sling.
```
