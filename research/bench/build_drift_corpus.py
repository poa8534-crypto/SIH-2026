"""Build the TERMINOLOGY-DRIFT benchmark: dataset/v2/ground_truth_drift.csv.

What this is
------------
The audit of the v2 corpus found ~72.6% of gold mentions contain a verbatim
>=6-token substring of the activity description they label (mean token
Jaccard ~0.50). Much of the held-out benchmark therefore measures near-copy
matching, not the problem statement's hard case: field language that does
NOT copy schedule language.

Every mention below is:
  * grounded in a REAL activity of dataset/baseline_schedule_v2.json
    (id, discipline, tag, quantities and dates are looked up, never invented);
  * written the way a site supervisor actually writes — short, verb-first,
    with field vocabulary ("hydrotest", "rebar", "tray work", "base poured");
  * checked by drift_quality.py to contain NO verbatim >=6-token run of the
    schedule description and a much lower token-Jaccard than the legacy set;
  * where the text genuinely cannot discriminate between sibling
    activities (same equipment, adjacent modules), `confusable_with` names
    the ambiguity set — those are legitimate REVIEW cases, not failures.

Quality is the point, not row count: ~120 rows that each require a real
terminology mapping beat 500 rows of paraphrased copies.

Usage:  .venv/bin/python research/bench/build_drift_corpus.py
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEDULE = ROOT / "dataset" / "baseline_schedule_v2.json"
OUT = ROOT / "dataset" / "v2" / "ground_truth_drift.csv"

# (activity_id, field mention, drift_kind, confusable_with[])
# drift_kind: terminology  — a controlled term pair carries the link
#             paraphrase  — same meaning, everyday rewording
#             sibling_hard — deliberately ambiguous sibling; REVIEW-expected
EXAMPLES: list[tuple[str, str, str, list[str]]] = [
    # ── civil / earthworks ────────────────────────────────────────────────
    ("CIV-SRV-1001", "Survey gang finished grid and level marks along the site boundary", "paraphrase", []),
    ("CIV-SRV-1002", "JCB clearing done up to the approach, stumps and topsoil removed", "terminology", []),
    ("CIV-EXC-1003", "U1 pad cut and fill brought to formation, levels checked", "paraphrase", ["CIV-EXC-1004"]),
    ("CIV-EXC-1004", "Unit 2 pad filled and cut to formation level today", "paraphrase", ["CIV-EXC-1003"]),
    ("CIV-EXC-1005", "Bad soil dug out and carted away from the U1 pad", "terminology", []),
    ("CIV-FIL-1006", "Fill soil placed and rolled in layers on the Unit 1 pad", "terminology", []),
    ("CIV-YRD-1046", "Crusher dust spread and levelled in the laydown yard", "terminology", []),
    ("CIV-EXC-1049", "Widening of the gate-to-site road done up to chainage 400", "paraphrase", []),
    ("CIV-RDS-1050", "Bituminous carpet laid on the approach road today", "terminology", []),
    ("CIV-DRA-1051", "Drain slabs cast along the roadside near the gate", "paraphrase", []),
    ("CIV-FNC-1052", "Chain link mesh fixed along the full road stretch", "terminology", []),
    ("CIV-DRA-1055", "Jute matting laid on the embankment slopes against washout", "terminology", []),
    ("CIV-RDS-1010", "Subgrade rolling completed for the internal road in U1", "terminology", []),
    ("CIV-RDS-1011", "GSB and wet mix macadam laid on the internal road", "terminology", []),
    ("CIV-RDS-1012", "WMM compacted up to chainage 160 on the U1 road", "sibling_hard", ["CIV-RDS-1013"]),
    ("CIV-RDS-1013", "Second stretch of wet mix finished, Ch 160 to 320", "sibling_hard", ["CIV-RDS-1012"]),
    ("CIV-DRA-1014", "Precast drain sections placed around the U1 wellhead", "paraphrase", []),
    ("CIV-DRA-1015", "Two culverts lowered at the road crossing", "paraphrase", []),
    ("CIV-EXC-1020", "Mass digging finished for the Unit 2 wellhead cellar", "terminology", []),
    ("CIV-FLR-1021", "Anti-termite spray and blinding concrete done on the U2 pad", "paraphrase", ["CIV-FLR-1022"]),
    ("CIV-FLR-1022", "Geotextile sheet spread over the Unit 2 pad area", "paraphrase", ["CIV-FLR-1021"]),
    ("CIV-EXC-1030", "Digging for the flare pit and burn area completed, south of manifold", "terminology", []),
    ("CIV-EXC-1031", "Rock broken and debris cleared at the FST-1301 base", "terminology", ["CIV-FDN-1126"]),
    ("CIV-FNC-1032", "Perimeter fencing posts and mesh completed", "terminology", ["CIV-FNC-1052"]),
    ("CIV-FNC-1033", "Main and emergency exit gates fixed today", "paraphrase", []),
    ("CIV-YRD-1054", "Bench marks and centre-line offsets given all over site", "paraphrase", []),
    ("HSE-TMP-1040", "Porta cabins for site office and store put up", "terminology", []),
    ("HSE-TMP-1041", "Temporary water supply and septic tank commissioned", "paraphrase", []),
    ("HSE-TMP-1042", "Temp power boards and site cabling arranged", "paraphrase", []),
    ("HSE-SGN-1043", "Sign boards and barricades placed at the phase 1 fronts", "paraphrase", ["HSE-SGN-1044"]),
    ("HSE-SGN-1044", "Muster points and windsocks set up at site", "terminology", ["HSE-SGN-1043"]),
    ("HSE-TMP-1053", "Fab shed and pipe yard ready for use", "paraphrase", []),
    # ── foundations / static equipment setting ───────────────────────────
    ("CIV-EXC-1100", "Pit digging for V-1101, V-1201 foundations and wellhead plinths completed", "terminology", ["CIV-EXC-1115"]),
    ("CIV-FDN-1101", "PCC blinding done below the V-1101 and V-1201 footings", "paraphrase", []),
    ("CIV-FDN-1102", "Rebar tied and placed for the separator foundation at V-1101", "terminology", ["CIV-FDN-1103"]),
    ("CIV-FDN-1103", "Formwork fixed and M25 poured for the V-1101 separator base", "terminology", ["CIV-FDN-1102"]),
    ("CIV-FDN-1104", "Curing started on the V-1101 foundation, wet hessian kept for 7 days", "terminology", []),
    ("CIV-FDN-1105", "Anchor bolts set on the separator skid base at V-1101", "paraphrase", ["CIV-FDN-1108"]),
    ("CIV-FDN-1106", "Grouting of the V-1101 base ring completed with non-shrink grout", "paraphrase", ["CIV-FDN-1109"]),
    ("CIV-FDN-1107", "Steel and concrete work finished for the glycol contactor base V-1201", "terminology", []),
    ("CIV-FDN-1108", "Bolt template set and surveyed at V-1201", "paraphrase", ["CIV-FDN-1105", "CIV-FDN-1127"]),
    ("CIV-FDN-1109", "Base ring grout filled at V-1201", "terminology", ["CIV-FDN-1106"]),
    ("CIV-FDN-1110", "Concrete plinths cast for WHP-1101 and WHP-1102", "paraphrase", []),
    ("CIV-FDN-1111", "Kerb stones cast around the U1 wellhead cellar", "paraphrase", []),
    ("CIV-EXC-1115", "Foundation pits dug for V-2101 and the WHCP in Unit 2", "terminology", ["CIV-EXC-1100"]),
    ("CIV-FDN-1116", "WHCP-2101 base cast and finished today", "paraphrase", []),
    ("CIV-FDN-1117", "V-2101 separator base: steel fixed and concrete poured", "terminology", ["CIV-FDN-1118"]),
    ("CIV-FDN-1118", "Wet curing begun on the V-2101 foundation", "terminology", ["CIV-FDN-1117", "CIV-FDN-1104"]),
    ("CIV-FDN-1119", "Skid grouting done at V-2101", "paraphrase", []),
    ("CIV-FDN-1120", "Plinth cast for the test separator V-2201 at Unit 2", "paraphrase", []),
    ("CIV-FDN-1125", "Small footings cast for the MV-1101 to MV-1108 block valves", "paraphrase", []),
    ("CIV-FDN-1126", "FST-1301 base concrete and guy anchor blocks done", "terminology", ["CIV-EXC-1031"]),
    ("CIV-FDN-1127", "Bolts set with template at the flare stack base", "terminology", ["CIV-FDN-1108"]),
    ("CIV-FDN-1150", "Ring wall for tank TK-2101 concreted", "paraphrase", ["CIV-FDN-1152"]),
    ("CIV-FDN-1151", "Annular plates levelled and grout bed laid under the TK-2101 shell", "terminology", []),
    ("CIV-FDN-1152", "TK-2102 ring wall pour finished", "sibling_hard", ["CIV-FDN-1150"]),
    ("CIV-FDN-1153", "Pit shuttering and concrete completed for the oil-water separator", "paraphrase", []),
    ("CIV-FDN-1154", "Bund wall raised around the tank farm", "terminology", []),
    ("PIP-UGS-1155", "Sewer line laid from the tank farm to the OWS", "terminology", []),
    ("PIP-UGS-1156", "Catch pits and chambers built at the OWS outfall", "paraphrase", []),
    ("CIV-FDN-1160", "Substation building plinth concrete completed", "paraphrase", ["CIV-FDN-1162"]),
    ("CIV-BLD-1161", "Brick work taken up to roof level for the control building", "terminology", []),
    ("CIV-FDN-1162", "Plinths cast for both transformers and trenches excavated", "terminology", ["CIV-FDN-1160"]),
    ("CIV-FDN-1165", "Footings for rack sleepers and columns cast in Module 1", "sibling_hard",
     ["CIV-FDN-1166", "CIV-FDN-1167"]),
    ("CIV-FDN-1166", "Rack footing concrete done between Ch 40 and 80", "sibling_hard",
     ["CIV-FDN-1165", "CIV-FDN-1167"]),
    ("CIV-FDN-1167", "Third module footings for the pipe rack finished", "sibling_hard",
     ["CIV-FDN-1165", "CIV-FDN-1166"]),
    ("CIV-UGS-1180", "Cable trench built with precast cover slabs, U1 to substation", "paraphrase", ["CIV-UGS-1181"]),
    ("CIV-UGS-1181", "Trench with covers completed from Unit 2 to the s/s", "sibling_hard", ["CIV-UGS-1180"]),
    ("CIV-UGS-1182", "Sand bedding and warning tiles laid in the cable routes", "paraphrase", []),
    ("STA-SET-1200", "V-1101 separator received from laydown and shifted to position", "paraphrase", ["STA-SET-1201"]),
    ("STA-SET-1201", "V-1101 lifted and placed on its foundation by crane", "terminology", ["STA-SET-1200", "STA-SET-1210"]),
    ("STA-SET-1202", "V-1101 levelled, aligned and hold-down bolts torqued", "terminology", []),
    ("STA-SET-1203", "Glycol contactor vessel erected at Unit 1", "terminology", []),
    ("STA-SET-1204", "Manifold headers positioned and set at Unit 1", "paraphrase", []),
    ("STA-WLD-1205", "Welding of the U1 manifold spools completed, 12 joints", "paraphrase", ["PIP-WLD-1313"]),
    ("STA-SET-1206", "Flowline risers put in at both wellheads", "paraphrase", []),
    ("STA-SET-1207", "Fuel gas skid placed on the utilities plinth", "paraphrase", []),
    # ── tanks / mechanical / rotating ─────────────────────────────────────
    ("STA-SET-1210", "V-2101 vessel set on its support at Unit 2", "terminology", ["STA-SET-1211", "STA-SET-1201"]),
    ("STA-SET-1211", "Test separator positioned in Unit 2", "sibling_hard", ["STA-SET-1210"]),
    ("STA-SET-1212", "Wellhead control panel skid lifted into place", "paraphrase", []),
    ("STA-INT-1213", "Demister pads and internals fitted inside V-2101", "terminology", ["STA-INT-1214"]),
    ("STA-INT-1214", "Trays and demister fitted to the test separator", "sibling_hard", ["STA-INT-1213"]),
    ("STA-SET-1215", "Air receiver installed in the utilities area", "paraphrase", []),
    ("STA-MCH-1216", "Compressor package PK-2401 positioned on its plinth", "paraphrase", []),
    ("STA-MCH-1217", "Compressor and receiver aligned and coupled", "terminology", ["STA-MCH-1241"]),
    ("STA-FLR-1220", "Flare stack sections assembled in the shop", "paraphrase", ["STA-FLR-1221"]),
    ("STA-FLR-1221", "Flare stack raised vertical with guys tensioned", "terminology", ["STA-FLR-1220"]),
    ("STA-FLR-1222", "Knock-out drum V-1401 set near the flare", "terminology", []),
    ("STA-FLR-1223", "Flare tip with molecular seal fitted on top of the stack", "paraphrase", ["STA-FLR-1224"]),
    ("STA-FLR-1224", "Ignition panel and pilot line hooked up at the flare", "sibling_hard", ["STA-FLR-1223"]),
    ("STA-TNK-1230", "First three shell courses of TK-2101 erected", "paraphrase", ["STA-TNK-1231", "STA-TNK-1232"]),
    ("STA-TNK-1232", "Wind girder fitted at course 3 of TK-2101", "terminology", ["STA-TNK-1230"]),
    ("STA-TNK-1233", "Roof structure of TK-2101 erected with fittings", "paraphrase", ["STA-TNK-1234"]),
    ("STA-TNK-1234", "TK-2102 shell and roof work completed", "sibling_hard", ["STA-TNK-1233"]),
    ("STA-TNK-1235", "Internal floating deck assembled inside TK-2102", "terminology", []),
    ("STA-TNK-1236", "Nozzles and manways fitted on both storage tanks", "paraphrase", []),
    ("STA-MCH-1240", "Crude pumps P-1401A and B set on the baseplate", "paraphrase", ["STA-MCH-1241"]),
    ("STA-MCH-1241", "Pump couplings aligned for P-1401A/B", "terminology", ["STA-MCH-1242", "STA-MCH-1217"]),
    ("STA-MCH-1242", "Motors mounted and hold-down bolts torqued on the crude pumps", "terminology", ["STA-MCH-1241"]),
    ("STA-SET-1243", "Chemical skids placed at wellhead U1/U2", "paraphrase", []),
    ("STA-SET-1244", "Monorail beam and davit put up on the separator platform", "paraphrase", []),
    # ── piping erection (cont.) ───────────────────────────────────────────
    ("PIP-ERC-1300", "Rack steel work started, multi-tier structure at Module 1", "paraphrase", ["PIP-ERC-1301", "PIP-ERC-1302"]),
    ("PIP-ERC-1301", "Module 2 rack structure erected between Ch 40 and 80", "sibling_hard", ["PIP-ERC-1300", "PIP-ERC-1302"]),
    ("PIP-ERC-1302", "Third module rack columns and beams up", "sibling_hard", ["PIP-ERC-1300", "PIP-ERC-1301"]),
    ("PIP-ERC-1303", "Bracing and kicker supports fixed along the full rack run", "paraphrase", []),
    ("PIP-ERC-1304", "Rack erected for the crude header stretch, U2 to tank farm", "paraphrase", ["PIP-ERC-1305"]),
    ("PIP-ERC-1305", "Tier 1 of Module 3 rack carrying the flare header piping", "sibling_hard", ["PIP-ERC-1304", "PIP-ERC-1330"]),
    ("PIP-FAB-1310", "Spools for the 24 inch crude line fabricated in shop", "terminology", ["PIP-ERC-1311"]),
    ("PIP-ERC-1311", "24 inch crude line erected on the U2 rack today", "terminology", ["PIP-ERC-1312", "PIP-FAB-1310"]),
    ("PIP-ERC-1312", "Crude header piping run up to the tank farm approach", "sibling_hard", ["PIP-ERC-1311"]),
    ("PIP-WLD-1313", "Joints 1 to 18 on the crude header rack welded and radiographed", "terminology", ["STA-WLD-1205"]),
    ("PIP-HLT-1314", "Pipe supports made and fixed along the 24 inch crude line", "paraphrase", ["PIP-HLT-1325"]),
    ("PIP-ERC-1315", "Gas line erection finished at the Unit 1 manifold", "paraphrase", []),
    ("PIP-ERC-1316", "Loop piping to the test separator erected", "paraphrase", []),
    ("PIP-ERC-1317", "Glycol feed line to the contactor erected", "terminology", []),
    ("PIP-ERC-1318", "Fuel gas inlet line hooked up to the skid", "paraphrase", []),
    ("PIP-INS-1319", "RO spools and sample connections installed at Unit 1", "terminology", []),
    ("PIP-FAB-1320", "U2 flowline manifolds fabricated at the shop", "paraphrase", []),
    ("PIP-ERC-1321", "Production header at Unit 2 erected", "paraphrase", ["PIP-ERC-1322"]),
    ("PIP-ERC-1322", "Test header line put up in Unit 2", "sibling_hard", ["PIP-ERC-1321"]),
    ("PIP-WLD-1323", "Welds 19 to 34 on the U2 header done and RT cleared", "terminology", []),
    ("PIP-BLT-1324", "Flange joints bolted and torqued on the U2 manifold", "terminology", []),
    ("PIP-HLT-1325", "Supports and guides fixed along the U2 rack stretch", "paraphrase", ["PIP-HLT-1314"]),
    ("PIP-ERC-1330", "Flare header line laid to the KO drum", "terminology", ["PIP-ERC-1331", "PIP-HYT-1512"]),
    ("PIP-ERC-1331", "Riser up the flare stack erected", "sibling_hard", ["PIP-ERC-1330"]),
    ("PIP-WLD-1332", "Alloy welding on the flare header done, PMI for joints 20 to 31", "terminology", []),
    ("PIP-ERC-1333", "Blowdown piping to the wellhead SDVs erected", "paraphrase", []),
    ("PIP-ERC-1334", "Closed drain header installed", "terminology", []),
    ("PIP-ERC-1340", "Manifold piping at the tank farm completed for TK-2101 in and out", "paraphrase", ["PIP-ERC-1342"]),
    ("PIP-ERC-1341", "Pump suction and delivery piping completed", "terminology", []),
    ("PIP-ERC-1342", "Tie-in piping for the TK-2102 manifold erected", "sibling_hard", ["PIP-ERC-1340"]),
    ("PIP-ERC-1343", "Tank water draw-off lines installed", "terminology", []),
    ("PIP-WLD-1344", "Manifold welds 40 to 52 completed with UT", "terminology", []),
    ("PIP-ERC-1350", "Instrument air line run from the rack to Unit 2", "terminology", ["PIP-DRY-1515"]),
    ("PIP-ERC-1351", "Nitrogen piping from the package to the header done", "terminology", []),
    ("PIP-ERC-1352", "Underground firewater tie-ins and hydrant branches completed", "paraphrase", []),
    ("PIP-ERC-1353", "Drinking water line laid to the control building", "terminology", []),
    ("PIP-ERC-1354", "Chemical injection lines run from skids to dosing points", "paraphrase", []),
    # ── electrical / instrumentation / firewater ──────────────────────────
    ("PIP-UGS-1170", "Trench dug for the firewater main between Unit 1 and the manifold", "terminology", ["PIP-UGS-1171"]),
    ("PIP-UGS-1171", "GRP pipe laid and jointed for the firewater loop", "terminology", ["PIP-UGS-1170"]),
    ("PIP-UGS-1172", "Firewater main tested between manifold and U1", "sibling_hard", ["PIP-UGS-1173"]),
    ("PIP-UGS-1173", "Section from Unit 1 to Unit 2 pressurised and held", "sibling_hard", ["PIP-UGS-1172"]),
    ("PIP-UGS-1174", "Trench refilled and compacted after the firewater test", "terminology", []),
    ("PIP-UGS-1175", "Hydrant and monitor foundations cast on the ring main", "paraphrase", []),
    ("EL-TRK-1360", "600 mm ladder-type tray fixed on rack tier 3", "terminology", ["EL-TRK-1361"]),
    ("EL-TRK-1361", "Tray work on tier 3 above Unit 2 completed", "terminology", ["EL-TRK-1360", "INS-TRK-1363"]),
    ("EL-TRK-1362", "Conduits and flexibles taken to the U1/U2 equipment", "paraphrase", []),
    ("INS-TRK-1363", "300 mm instrument tray laid on tier 2", "terminology", ["EL-TRK-1360"]),
    ("EL-TRK-1370", "Trays and risers installed at the substation building", "paraphrase", []),
    ("EL-TRF-1371", "Transformer T-1 positioned and HT/LT terminations done", "terminology", ["EL-TRF-1372"]),
    ("EL-TRF-1372", "T-2 transformer set and terminated", "sibling_hard", ["EL-TRF-1371"]),
    ("EL-SWB-1373", "MCC and switchboard panels installed in the substation room", "paraphrase", []),
    ("EL-CBL-1374", "11 kV cable pulled from the substation to T-1", "terminology", ["EL-CBL-1375"]),
    ("EL-CBL-1375", "MV feeder cable drawn to transformer T-2", "sibling_hard", ["EL-CBL-1374"]),
    ("EL-CBL-1376", "Power cables laid for the crude pump motors", "terminology", ["EL-CBL-1377"]),
    ("EL-CBL-1377", "Feeder cables pulled to the wellhead panel", "sibling_hard", ["EL-CBL-1376"]),
    ("EL-GRD-1378", "Earthing grid and pits completed across the site", "terminology", ["EL-GRD-1379"]),
    ("EL-GRD-1379", "Lightning masts erected with down conductors at the flare", "paraphrase", ["EL-GRD-1378"]),
    ("EL-LTG-1380", "Light poles and floodlights installed at the wellheads", "terminology", ["EL-LTG-1381"]),
    ("EL-LTG-1381", "Emergency lights and exit boards fitted in the control building", "paraphrase", ["EL-LTG-1380"]),
    ("EL-CBL-1382", "LV panels glanded and terminated at the substation", "paraphrase", ["EL-CBL-1383"]),
    ("EL-CBL-1383", "Glanding of MCC feeder cables completed", "terminology", ["EL-CBL-1384", "EL-CBL-1382"]),
    ("EL-CBL-1384", "Cores terminated and laced at both MCCs", "terminology", ["EL-CBL-1383"]),
    # ── instrumentation / testing / closeout ──────────────────────────────
    ("INS-IMP-1390", "Air tubing take-offs and manifolds fitted for the instruments", "paraphrase", []),
    ("INS-FIT-1391", "PTs mounted at Unit 1 grade and on the rack", "terminology", ["INS-FIT-1392"]),
    ("INS-FIT-1392", "Level transmitters fixed on the vessels", "sibling_hard", ["INS-FIT-1391"]),
    ("INS-FIT-1393", "Temp elements installed at their points", "terminology", []),
    ("INS-FIT-1394", "Flowmeters fitted at the Unit 2 lines", "terminology", []),
    ("INS-JBX-1395", "Field JB's mounted and ready", "terminology", ["INS-CBL-1396"]),
    ("INS-CBL-1396", "Instrument cables pulled from tier 2 to the JB's", "terminology", ["INS-CBL-1397", "INS-JBX-1395"]),
    ("INS-CBL-1397", "Home runs drawn from the JB's to the control room FTA", "terminology", ["INS-CBL-1396"]),
    ("INS-TER-1398", "Field cable terminations completed at the junction boxes", "paraphrase", []),
    ("INS-IMP-1399", "Solenoids fitted on ESD valves and hooked to the blowdown lines", "paraphrase", []),
    ("INS-FIT-1400", "F&G detectors mounted at the wellhead and manifold", "terminology", []),
    ("INS-CAL-1405", "Transmitters and switches calibrated on the bench", "paraphrase", []),
    ("INS-CHK-1406", "Loops checked out for Unit 1", "terminology", ["INS-CHK-1407", "INS-CHK-1408"]),
    ("INS-CHK-1407", "U2 loop continuity checks done", "sibling_hard", ["INS-CHK-1406", "INS-CHK-1408"]),
    ("INS-CHK-1408", "Tank farm and utility loops verified", "sibling_hard", ["INS-CHK-1406", "INS-CHK-1407"]),
    ("INS-CHK-1409", "C&E test of the shutdown matrix done", "terminology", ["INS-CHK-1542"]),
    ("PIP-HYT-1510", "Hydrotest of the first package cleared for the U1 lines", "terminology", ["PIP-HYT-1511"]),
    ("PIP-HYT-1511", "Second test pack pressurised and held on the U2 header", "terminology", ["PIP-HYT-1510", "PIP-HYT-1513"]),
    ("PIP-HYT-1512", "Nitrogen leak test done on the flare header", "terminology", ["PIP-ERC-1330"]),
    ("PIP-HYT-1513", "Tank farm manifold and pump suction lines hydro tested", "terminology", ["PIP-HYT-1511"]),
    ("PIP-FLS-1514", "Test packs flushed, dried and reinstated", "paraphrase", []),
    ("PIP-DRY-1515", "Air blowing of the instrument air header completed", "paraphrase", ["PIP-ERC-1350"]),
    ("STA-PRS-1520", "Both separators held pressure, tightness ok", "terminology", ["PIP-HYT-1513"]),
    ("STA-DRY-1521", "TK-2101 filled with water for settlement observation", "terminology", ["STA-DRY-1522"]),
    ("STA-DRY-1522", "TK-2102 water filled and strapping calibration done", "sibling_hard", ["STA-DRY-1521"]),
    ("STA-ROT-1523", "Pump motors bumped in both directions", "terminology", ["STA-ROT-1524"]),
    ("STA-ROT-1524", "Crude pumps ran on performance trial", "terminology", ["STA-ROT-1523"]),
    ("STA-CMP-1525", "Compressor package loaded and tested", "terminology", []),
    ("STA-FLS-1526", "Pilot ignited and purge line cleared at the flare", "paraphrase", []),
    ("STA-RUN-1527", "72-hour reliability run of the process train completed", "paraphrase", []),
    ("EL-ENS-1530", "Hi-pot and IR values taken for the MV feeders", "terminology", []),
    ("EL-ENS-1531", "Relays set and primary injection completed", "terminology", []),
    ("EL-ENS-1532", "Substation charged up today", "terminology", []),
    ("INS-CHK-1540", "Loops rechecked after the hydrotest", "terminology", ["INS-CHK-1406"]),
    ("INS-CMS-1541", "Fire and gas system function tested", "terminology", ["INS-FIT-1400"]),
    ("INS-CHK-1542", "ESD with blowdown tested end to end", "terminology", ["INS-CHK-1409"]),
    ("INS-MS-1543", "Loop certificates signed, RFSI ready", "paraphrase", []),
    ("HSE-REG-1544", "PESO inspection of both storage tanks over", "terminology", ["HSE-REG-1545"]),
    ("HSE-REG-1545", "Statutory inspection cleared for the flare and vessels", "sibling_hard", ["HSE-REG-1544"]),
    ("HSE-REG-1546", "Pollution board compliance round done", "terminology", []),
    ("HSE-PSC-1550", "Pre-startup safety round completed", "terminology", []),
    ("HSE-DOC-1551", "Red-lines transferred to the as-built drawings", "terminology", ["HSE-DOC-1559"]),
    ("HSE-DOC-1552", "Handover dossiers and O&M manuals compiled", "paraphrase", ["HSE-DOC-1559"]),
    ("HSE-TRN-1553", "Operators trained and familiarised", "paraphrase", []),
    ("HSE-HDO-1554", "Unit 1 declared ready for start-up", "terminology", ["HSE-HDO-1555"]),
    ("HSE-HDO-1555", "RFSU given for Unit 2", "sibling_hard", ["HSE-HDO-1554"]),
    ("STA-MS-1556", "First crude pumped into TK-2101", "terminology", []),
    ("HSE-HDO-1557", "Plant handed over provisionally to operations", "terminology", []),
    ("HSE-PUN-1558", "Category A and B punches closed out", "terminology", []),
    ("HSE-DOC-1559", "As-builts submitted and documents closed with OIL", "terminology", ["HSE-DOC-1551", "HSE-DOC-1552"]),
]


def main() -> None:
    acts = {a["activity_id"]: a for a in json.loads(SCHEDULE.read_text())}
    rows: list[dict] = []
    seen_mentions: set[str] = set()
    problems: list[str] = []

    for aid, mention, kind, confusable in EXAMPLES:
        a = acts.get(aid)
        if a is None:
            problems.append(f"{aid}: not in schedule")
            continue
        if mention.lower() in seen_mentions:
            problems.append(f"{aid}: duplicate mention text")
        seen_mentions.add(mention.lower())
        # The report date sits INSIDE the activity's planned window so the
        # date_proximity feature never penalises a mention for the corpus's
        # own bookkeeping; the drift text itself is the thing under test.
        try:
            ps = date.fromisoformat(a["planned_start"])
            pf = date.fromisoformat(a["planned_finish"])
        except (KeyError, ValueError):
            ps = pf = date(2026, 6, 1)
        src_date = ps + timedelta(days=min(1, max(0, (pf - ps).days)))
        rows.append({
            "source": "drift_bench_v1",
            "source_date": src_date.isoformat(),
            "raw_mention": mention,
            "activity_id": aid,
            "match_type": "terminology_drift",
            "mention_date": "",
            "discipline": a["discipline"],
            "split": "test",
            "near_miss_kind": "",
            "missing_discriminator": "",
            "confusable_with": "|".join(confusable),
            "drift_kind": kind,
        })

    if problems:
        for p in problems:
            print("PROBLEM:", p)
        sys.exit(2)

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    from collections import Counter
    print(f"wrote {len(rows)} rows -> {OUT.relative_to(ROOT)}")
    print("drift_kind:", dict(Counter(r["drift_kind"] for r in rows)))
    print("discipline:", dict(Counter(r["discipline"] for r in rows)))


if __name__ == "__main__":
    main()






