#!/usr/bin/env python3
"""
Generate synthetic EPC field-reporting dataset for SIH26122.
All artifacts cross-reference each other. ground_truth.csv is the evaluation key.

Every write names encoding="utf-8" explicitly. Without it Python uses the
platform default, which on Windows is cp1252 - and that is how an em-dash was
written into the committed corpus as the single byte 0x97, which is not valid
UTF-8 at all. See D-045.
"""
import json, csv, os, random
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

random.seed(20260822)
os.makedirs("dataset", exist_ok=True)

# ══════════════════════════════════════════════════════════════════════════════
# A) BASELINE SCHEDULE — 120 L5/L6 activities
# ══════════════════════════════════════════════════════════════════════════════

activities = []

def act(aid, wbs, desc, detail, disc, ps, pf, qty, uom, preds, tag):
    activities.append({
        "activity_id": aid, "wbs_path": wbs, "description": desc,
        "detail": detail, "discipline": disc, "planned_start": ps,
        "planned_finish": pf, "planned_qty": qty, "uom": uom,
        "predecessors": preds, "tag": tag
    })

# ── CIVIL (22) ──────────────────────────────────────────────────────────────
act("CIV-SIT-1001","1.1.1.1","Site Clearing & Grubbing — Zone A","Clear vegetation and topsoil from Zone A; grub roots to 300 mm depth","civil","2026-06-01","2026-06-07",1200,"m2",[],None)
act("CIV-SIT-1002","1.1.1.2","Site Clearing & Grubbing — Zone B","Clear vegetation and topsoil from Zone B; grub roots to 300 mm depth","civil","2026-06-03","2026-06-10",1200,"m2",["CIV-SIT-1001"],None)
act("CIV-SIT-1003","1.1.1.3","Site Grading & Compaction — Zone A+B","Machine grade to design levels, compact subgrade to 95% MDD","civil","2026-06-11","2026-06-17",2400,"m2",["CIV-SIT-1001","CIV-SIT-1002"],None)
act("CIV-PLY-1004","1.1.2.1","Bored Piling — Pipe Rack P1–P12","Bore 600 mm dia CFA piles to 12 m depth, 16 nos","civil","2026-06-18","2026-07-01",16,"nos",["CIV-SIT-1003"],None)
act("CIV-PLY-1005","1.1.2.2","Bored Piling — Equipment Foundation EF-1 to EF-4","Bore 800 mm dia CFA piles to 15 m depth, 24 nos","civil","2026-06-20","2026-07-05",24,"nos",["CIV-SIT-1003"],None)
act("CIV-PLY-1006","1.1.2.3","Bored Piling — Tank Foundation TK-1","Bore 600 mm dia bored piles to 18 m depth, 32 nos","civil","2026-06-25","2026-07-12",32,"nos",["CIV-SIT-1003"],None)
act("CIV-FDN-1007","1.1.3.1","Pedestal Concreting — Pipe Rack P1–P12","Cast M30 concrete pedestals for pipe rack columns, 48 m3","civil","2026-07-02","2026-07-12",48,"m3",["CIV-PLY-1004"],None)
act("CIV-FDN-1008","1.1.3.2","Equipment Foundation Concreting — EF-1 to EF-4","Cast M35 RC foundations for rotating equipment, 120 m3","civil","2026-07-06","2026-07-20",120,"m3",["CIV-PLY-1005"],None)
act("CIV-FDN-1009","1.1.3.3","Tank Foundation Ringwall — TK-1","Cast M30 ringwall foundation for TK-1, 65 m3","civil","2026-07-13","2026-07-25",65,"m3",["CIV-PLY-1006"],None)
act("CIV-FDN-1010","1.1.3.4","Slab-on-Grade — Pump House","Cast M30 slab-on-grade 200 mm thk, 180 m2","civil","2026-07-14","2026-07-21",180,"m2",["CIV-PLY-1005"],None)
act("CIV-BKL-1011","1.1.4.1","Backfilling — Pipe Rack Trenches","Backfill pipe rack trench with compacted sand, 320 m3","civil","2026-07-22","2026-07-28",320,"m3",["CIV-FDN-1007"],None)
act("CIV-BKL-1012","1.1.4.2","Backfilling — Equipment Pads","Backfill around equipment foundations, 180 m3","civil","2026-07-21","2026-07-28",180,"m3",["CIV-FDN-1008"],None)
act("CIV-BND-1013","1.1.5.1","Containment Bund Wall — Zone A","Construct 600 mm thk RC bund wall around tank battery, 85 m3","civil","2026-07-26","2026-08-08",85,"m3",["CIV-FDN-1009"],None)
act("CIV-GBM-1014","1.1.5.2","Grade Beams — Pipe Rack","Cast M30 grade beams between pipe rack pedestals, 42 m3","civil","2026-07-15","2026-07-22",42,"m3",["CIV-FDN-1007"],None)
act("CIV-DWG-1015","1.1.5.3","Drainage Channels — Perimeter","Construct RC drainage channels around plot perimeter, 160 lm","civil","2026-08-01","2026-08-12",160,"lm",["CIV-SIT-1003"],None)
act("CIV-FNC-1016","1.1.6.1","Fence & Gate — Plot Boundary","Install chain-link fence 2.4 m ht with 3 gates, 480 lm","civil","2026-08-10","2026-08-18",480,"lm",["CIV-SIT-1003"],None)
act("CIV-PLG-1017","1.1.6.2","Firewater Pit — Zone B","Excavate and line firewater collection pit, 45 m3","civil","2026-08-05","2026-08-12",45,"m3",["CIV-SIT-1002"],None)
act("CIV-FND-1018","1.1.7.1","Foundation — Compressor Skid CS-01","Cast M35 foundation block for CS-01, 35 m3","civil","2026-07-08","2026-07-16",35,"m3",["CIV-PLY-1005"],None)
act("CIV-FND-1019","1.1.7.2","Foundation — Header Skid HS-01","Cast M30 foundation block for HS-01, 28 m3","civil","2026-07-10","2026-07-17",28,"m3",["CIV-PLY-1004"],None)
act("CIV-FLR-1020","1.1.8.1","Flooring — MCC Room","Vitrified tile flooring in MCC room, 95 m2","civil","2026-07-28","2026-08-03",95,"m2",["CIV-PLY-1005"],None)
act("CIV-PLT-1021","1.1.8.2","Plastering & Painting — MCC Room","Internal plaster and distemper for MCC room walls, 220 m2","civil","2026-08-04","2026-08-10",220,"m2",["CIV-FLR-1020"],None)
act("CIV-APN-1022","1.1.8.3","Cable Tray Buried — Zone A+B","Install buried cable tray in trenches, 280 lm","civil","2026-08-01","2026-08-10",280,"lm",["CIV-BKL-1011"],None)

# ── PIPING (30) ─────────────────────────────────────────────────────────────
act("PIP-RCK-1023","1.2.1.1","Pipe Rack Steel Erection — Tier 1","Erect W-section columns and beams for Tier 1 pipe rack, 42 MT","piping","2026-07-13","2026-07-25",42,"MT",["CIV-FDN-1007"],None)
act("PIP-RCK-1024","1.2.1.2","Pipe Rack Steel Erection — Tier 2","Erect W-section beams for Tier 2 pipe rack, 28 MT","piping","2026-07-22","2026-08-02",28,"MT",["PIP-RCK-1023"],None)
act("PIP-SPL-1025","1.2.2.1","Spool Fabrication — 24\"-P-1001-A1A","Fabricate spools for 24\" main header, 18 spools","piping","2026-07-15","2026-08-05",18,"nos",["PIP-RCK-1023"],"24\"-P-1001-A1A")
act("PIP-SPL-1026","1.2.2.2","Spool Fabrication — 12\"-P-1002-B1A","Fabricate spools for 12\" transfer line, 12 spools","piping","2026-07-18","2026-08-01",12,"nos",["PIP-RCK-1023"],"12\"-P-1002-B1A")
act("PIP-SPL-1027","1.2.2.3","Spool Fabrication — 8\"-P-1003-A1B","Fabricate spools for 8\" flare header, 14 spools","piping","2026-07-20","2026-08-08",14,"nos",["PIP-RCK-1023"],"8\"-P-1003-A1B")
act("PIP-SPL-1028","1.2.2.4","Spool Fabrication — 4\"-P-1010-C1A","Fabricate spools for 4\" utility water, 8 spools","piping","2026-07-25","2026-08-10",8,"nos",["PIP-RCK-1024"],"4\"-P-1010-C1A")
act("PIP-SPL-1029","1.2.2.5","Spool Fabrication — 6\"-P-1015-A1A","Fabricate spools for 6\" drain header, 10 spools","piping","2026-07-28","2026-08-12",10,"nos",["PIP-RCK-1024"],"6\"-P-1015-A1A")
act("PIP-ERC-1030","1.2.3.1","Spool Erection — 24\"-P-1001-A1A","Erect and fit-up spools for 24\" main header, 18 spools","piping","2026-08-01","2026-08-18",18,"nos",["PIP-SPL-1025","PIP-RCK-1024"],"24\"-P-1001-A1A")
act("PIP-ERC-1031","1.2.3.2","Spool Erection — 12\"-P-1002-B1A","Erect spools for 12\" transfer line, 12 spools","piping","2026-08-02","2026-08-15",12,"nos",["PIP-SPL-1026","PIP-RCK-1024"],"12\"-P-1002-B1A")
act("PIP-ERC-1032","1.2.3.3","Spool Erection — 8\"-P-1003-A1B","Erect spools for 8\" flare header, 14 spools","piping","2026-08-06","2026-08-22",14,"nos",["PIP-SPL-1027","PIP-RCK-1024"],"8\"-P-1003-A1B")
act("PIP-ERC-1033","1.2.3.4","Spool Erection — 4\"-P-1010-C1A","Erect spools for 4\" utility water, 8 spools","piping","2026-08-11","2026-08-22",8,"nos",["PIP-SPL-1028","PIP-RCK-1024"],"4\"-P-1010-C1A")
act("PIP-ERC-1034","1.2.3.5","Spool Erection — 6\"-P-1015-A1A","Erect spools for 6\" drain header, 10 spools","piping","2026-08-13","2026-08-25",10,"nos",["PIP-SPL-1029","PIP-RCK-1024"],"6\"-P-1015-A1A")
act("PIP-FLG-1035","1.2.4.1","Flange Management — 24\"-P-1001-A1A","Flange bolt-up for 24\" main header, 36 flanges","piping","2026-08-19","2026-08-26",36,"nos",["PIP-ERC-1030"],"24\"-P-1001-A1A")
act("PIP-FLG-1036","1.2.4.2","Flange Management — 12\"-P-1002-B1A","Flange bolt-up for 12\" transfer, 24 flanges","piping","2026-08-16","2026-08-22",24,"nos",["PIP-ERC-1031"],"12\"-P-1002-B1A")
act("PIP-FLG-1037","1.2.4.3","Flange Management — 8\"-P-1003-A1B","Flange bolt-up for 8\" flare header, 28 flanges","piping","2026-08-23","2026-08-30",28,"nos",["PIP-ERC-1032"],"8\"-P-1003-A1B")
act("PIP-FLG-1038","1.2.4.4","Flange Management — 4\"-P-1010-C1A","Flange bolt-up for 4\" utility water, 16 flanges","piping","2026-08-23","2026-08-28",16,"nos",["PIP-ERC-1033"],"4\"-P-1010-C1A")
act("PIP-FLG-1039","1.2.4.5","Flange Management — 6\"-P-1015-A1A","Flange bolt-up for 6\" drain header, 20 flanges","piping","2026-08-26","2026-09-02",20,"nos",["PIP-ERC-1034"],"6\"-P-1015-A1A")
act("PIP-HYT-1040","1.2.5.1","Hydrotest — 24\"-P-1001-A1A","Hydrotest 24\" main header at 1.5x design, 6 sections","piping","2026-08-27","2026-09-03",6,"nos",["PIP-FLG-1035"],"24\"-P-1001-A1A")
act("PIP-HYT-1041","1.2.5.2","Hydrotest — 12\"-P-1002-B1A","Hydrotest 12\" transfer, 4 sections","piping","2026-08-23","2026-08-28",4,"nos",["PIP-FLG-1036"],"12\"-P-1002-B1A")
act("PIP-HYT-1042","1.2.5.3","Hydrotest — 8\"-P-1003-A1B","Hydrotest 8\" flare header, 5 sections","piping","2026-08-31","2026-09-06",5,"nos",["PIP-FLG-1037"],"8\"-P-1003-A1B")
act("PIP-HYT-1043","1.2.5.4","Hydrotest — 4\"-P-1010-C1A","Hydrotest 4\" utility water, 3 sections","piping","2026-08-29","2026-09-03",3,"nos",["PIP-FLG-1038"],"4\"-P-1010-C1A")
act("PIP-HYT-1044","1.2.5.5","Hydrotest — 6\"-P-1015-A1A","Hydrotest 6\" drain header, 3 sections","piping","2026-09-03","2026-09-08",3,"nos",["PIP-FLG-1039"],"6\"-P-1015-A1A")
act("PIP-INS-1045","1.2.6.1","Insulation — 24\"-P-1001-A1A","50 mm mineral wool + aluminium cladding, 120 m2","piping","2026-09-04","2026-09-14",120,"m2",["PIP-HYT-1040"],"24\"-P-1001-A1A")
act("PIP-INS-1046","1.2.6.2","Insulation — 12\"-P-1002-B1A","50 mm mineral wool insulation, 65 m2","piping","2026-08-29","2026-09-06",65,"m2",["PIP-HYT-1041"],"12\"-P-1002-B1A")
act("PIP-INS-1047","1.2.6.3","Insulation — 8\"-P-1003-A1B","50 mm mineral wool insulation, 80 m2","piping","2026-09-07","2026-09-15",80,"m2",["PIP-HYT-1042"],"8\"-P-1003-A1B")
act("PIP-PAI-1048","1.2.7.1","Painting & Coating — Pipe Rack","3-coat epoxy paint system, 850 m2","piping","2026-09-01","2026-09-12",850,"m2",["PIP-ERC-1030","PIP-ERC-1031"],None)
act("PIP-SUP-1049","1.2.7.2","Pipe Support Installation — Tier 1","Spring hangers and rest supports, 145 nos","piping","2026-08-10","2026-08-25",145,"nos",["PIP-RCK-1023"],None)
act("PIP-SUP-1050","1.2.7.3","Pipe Support Installation — Tier 2","Variable spring supports, 88 nos","piping","2026-08-15","2026-08-28",88,"nos",["PIP-RCK-1024"],None)
act("PIP-SKN-1051","1.2.8.1","Skid Piping — CS-01","Fabricate and erect piping on CS-01, 6 spools","piping","2026-08-05","2026-08-20",6,"nos",["CIV-FND-1018"],"CS-01")
act("PIP-PCD-1053","1.2.8.2","P&ID Punch List Close-out","Close all Cat A and B punch list items","piping","2026-09-15","2026-09-22",0,"nos",["PIP-HYT-1040","PIP-HYT-1041","PIP-HYT-1042"],None)

# ── STATIC EQUIPMENT (22) ───────────────────────────────────────────────────
act("SEQ-VSL-1054","1.3.1.1","Vessel Delivery — V-101 separator","Transport V-101 from laydown to pad, 28 MT","static_equipment","2026-07-20","2026-07-25",1,"nos",["CIV-FDN-1008"],"V-101")
act("SEQ-VSL-1055","1.3.1.2","Vessel Setting — V-101 separator","Hydraulic jacking and setting V-101, 28 MT","static_equipment","2026-07-26","2026-07-30",1,"nos",["SEQ-VSL-1054"],"V-101")
act("SEQ-VSL-1056","1.3.1.3","Vessel Delivery — V-102 filter","Transport V-102 cartridge filter, 8 MT","static_equipment","2026-07-28","2026-07-31",1,"nos",["CIV-FDN-1008"],"V-102")
act("SEQ-VSL-1057","1.3.1.4","Vessel Setting — V-102 filter","Set V-102 on foundation pad, 8 MT","static_equipment","2026-08-01","2026-08-03",1,"nos",["SEQ-VSL-1056"],"V-102")
act("SEQ-EXC-1058","1.3.2.1","Exchanger Delivery — E-101","Transport E-101 shell & tube exchanger, 12 MT","static_equipment","2026-07-25","2026-07-28",1,"nos",["CIV-FDN-1008"],"E-101")
act("SEQ-EXC-1059","1.3.2.2","Exchanger Setting — E-101","Set E-101 on saddle supports, align and grout, 12 MT","static_equipment","2026-07-29","2026-08-02",1,"nos",["SEQ-EXC-1058"],"E-101")
act("SEQ-PMP-1060","1.3.3.1","Pump Delivery — P-101A/B","Transport P-101A and P-101B pumps, 4 MT each","static_equipment","2026-08-01","2026-08-04",2,"nos",["CIV-FDN-1010"],"P-101A/B")
act("SEQ-PMP-1061","1.3.3.2","Pump Setting & Alignment — P-101A/B","Set P-101A/B on baseplates, laser-align to motor, grout","static_equipment","2026-08-05","2026-08-12",2,"nos",["SEQ-PMP-1060"],"P-101A/B")
act("SEQ-SKD-1062","1.3.4.1","Compressor Skid CS-01 Delivery","Transport CS-01 from fabrication yard, 35 MT","static_equipment","2026-08-10","2026-08-14",1,"nos",["CIV-FND-1018"],"CS-01")
act("SEQ-SKD-1063","1.3.4.2","Compressor Skid CS-01 Setting","Jack and slide CS-01 onto foundation, level and anchor","static_equipment","2026-08-15","2026-08-20",1,"nos",["SEQ-SKD-1062"],"CS-01")
act("SEQ-SKD-1064","1.3.4.3","Header Skid HS-01 Delivery","Transport HS-01 to site, 18 MT","static_equipment","2026-08-12","2026-08-15",1,"nos",["CIV-FND-1019"],"HS-01")
act("SEQ-SKD-1065","1.3.4.4","Header Skid HS-01 Setting","Set HS-01 on foundation, align and anchor","static_equipment","2026-08-16","2026-08-20",1,"nos",["SEQ-SKD-1064"],"HS-01")
act("SEQ-TKN-1066","1.3.5.1","Tank TK-1 Shell Erection","Erect TK-1 CS storage tank by jacking method, 85 MT","static_equipment","2026-07-26","2026-08-15",85,"MT",["CIV-FDN-1009"],"TK-1")
act("SEQ-TKN-1067","1.3.5.2","Tank TK-1 Roof Installation","Install TK-1 pontoon roof and fittings, 12 MT","static_equipment","2026-08-16","2026-08-22",12,"MT",["SEQ-TKN-1066"],"TK-1")
act("SEQ-TKN-1068","1.3.5.3","Tank TK-1 Hydrotest","Hydrotest TK-1 with fresh water, 48-hr retention","static_equipment","2026-08-23","2026-08-27",1,"nos",["SEQ-TKN-1067"],"TK-1")
act("SEQ-TKN-1069","1.3.5.4","Tank TK-1 Internal Coating","Apply epoxy lining to TK-1 interior, 420 m2","static_equipment","2026-08-28","2026-09-08",420,"m2",["SEQ-TKN-1068"],"TK-1")
act("SEQ-ALN-1070","1.3.6.1","Equipment Alignment Check — Rotating","Laser alignment of P-101A/B, P-102A, record readings","static_equipment","2026-08-13","2026-08-17",5,"nos",["SEQ-PMP-1061"],None)
act("SEQ-ALN-1071","1.3.6.2","Grouting — Compressor Skid CS-01","Inject epoxy grout under CS-01 baseplate, 0.8 m3","static_equipment","2026-08-21","2026-08-25",0.8,"m3",["SEQ-SKD-1063"],"CS-01")
act("SEQ-ALN-1072","1.3.6.3","Grouting — Header Skid HS-01","Inject cementitious grout under HS-01, 0.5 m3","static_equipment","2026-08-21","2026-08-24",0.5,"m3",["SEQ-SKD-1065"],"HS-01")
act("SEQ-PIP-1073","1.3.7.1","Nozzle-Ready Inspection — V-101","Verify V-101 nozzles flanged and capped before tie-in","static_equipment","2026-07-31","2026-08-02",6,"nos",["SEQ-VSL-1055"],"V-101")
act("SEQ-PIP-1074","1.3.7.2","Nozzle-Ready Inspection — E-101","Verify E-101 nozzle orientation and blind flanges","static_equipment","2026-08-03","2026-08-05",4,"nos",["SEQ-EXC-1059"],"E-101")
act("SEQ-CMN-1075","1.3.8.1","Equipment Foundation Settlement Monitoring","Weekly settlement survey, 8 readings","static_equipment","2026-07-14","2026-09-15",8,"nos",["CIV-FDN-1008","CIV-FDN-1010"],None)

# ── ELECTRICAL (20) ─────────────────────────────────────────────────────────
act("ELE-CBL-1076","1.4.1.1","HT Cable Laying — Substation to MCC","Lay 33kV XLPE cable, 1.2 km","electrical","2026-08-05","2026-08-18",1200,"m",["CIV-APN-1022"],None)
act("ELE-CBL-1077","1.4.1.2","LT Cable Laying — MCC to Pumps","Lay 660V cable from MCC to P-101A/B, 680 m","electrical","2026-08-15","2026-08-25",680,"m",["CIV-APN-1022","CIV-FLR-1020"],None)
act("ELE-CBL-1078","1.4.1.3","Control Cable Laying — Field to MCC","Lay 1.5 kV control cables, 3.4 km","electrical","2026-08-18","2026-09-01",3400,"m",["CIV-APN-1022"],None)
act("ELE-TRF-1079","1.4.2.1","Transformer Installation — TR-01","Set and connect 33/6.6kV transformer, 15 MVA","electrical","2026-07-15","2026-07-28",1,"nos",["CIV-SIT-1003"],None)
act("ELE-TRF-1080","1.4.2.2","Transformer Oil Filling & Testing — TR-01","Fill TR-01 with transformer oil, BDV and moisture tests","electrical","2026-07-29","2026-08-03",1,"nos",["ELE-TRF-1079"],None)
act("ELE-SWG-1081","1.4.2.3","SWGR Erection — 6.6kV","Erect 6.6kV switchgear panel, 8 panels","electrical","2026-07-20","2026-08-01",8,"nos",["CIV-FLR-1020"],None)
act("ELE-SWG-1082","1.4.2.4","MCC Panel Installation","Install motor control centre panels, 6 panels","electrical","2026-08-02","2026-08-12",6,"nos",["CIV-FLR-1020","ELE-SWG-1081"],None)
act("ELE-FLT-1083","1.4.3.1","Cable Termination — HT","Terminate 33kV cable ends with heat-shrink kits, 24 ends","electrical","2026-08-19","2026-08-28",24,"nos",["ELE-CBL-1076"],None)
act("ELE-FLT-1084","1.4.3.2","Cable Termination — LT","Terminate 660V motor cables, 48 ends","electrical","2026-08-26","2026-09-04",48,"nos",["ELE-CBL-1077"],None)
act("ELE-FLT-1085","1.4.3.3","Cable Termination — Control","Terminate control cables at marshalling and JBs, 186 ends","electrical","2026-09-02","2026-09-14",186,"nos",["ELE-CBL-1078"],None)
act("ELE-GRD-1086","1.4.4.1","Earthing System — Grid","Install copper earthing grid, 2.4 km conductor","electrical","2026-07-25","2026-08-10",2400,"m",["CIV-SIT-1003"],None)
act("ELE-GRD-1087","1.4.4.2","Lightning Protection — Pipe Rack","Install down conductors and air terminals, 18 nos","electrical","2026-08-05","2026-08-15",18,"nos",["PIP-RCK-1023"],None)
act("ELE-LIG-1088","1.4.5.1","Area Lighting Installation","Install LED flood and area lights, 32 nos","electrical","2026-08-20","2026-09-01",32,"nos",["PIP-RCK-1023","PIP-RCK-1024"],None)
act("ELE-LIG-1089","1.4.5.2","Lighting Circuit Testing","Megger and functional test all lighting circuits, 16 nos","electrical","2026-09-02","2026-09-06",16,"nos",["ELE-LIG-1088"],None)
act("ELE-IGT-1090","1.4.6.1","Insulation Resistance Testing — HT","Megger test all 33kV cables at 1kV DC, 24 cables","electrical","2026-08-29","2026-09-05",24,"nos",["ELE-FLT-1083"],None)
act("ELE-IGT-1091","1.4.6.2","Insulation Resistance Testing — LT","Megger test all 660V cables at 500V DC, 48 cables","electrical","2026-09-05","2026-09-12",48,"nos",["ELE-FLT-1084"],None)
act("ELE-ENG-1092","1.4.7.1","Energisation — SWGR 6.6kV","Energise 6.6kV switchgear from transformer","electrical","2026-09-06","2026-09-10",1,"nos",["ELE-IGT-1090","ELE-TRF-1080","ELE-SWG-1081"],None)
act("ELE-ENG-1093","1.4.7.2","Energisation — MCC","Energise MCC panels from SWGR, verify interlocks","electrical","2026-09-11","2026-09-14",1,"nos",["ELE-ENG-1092","ELE-SWG-1082"],None)
act("ELE-MTR-1094","1.4.8.1","Motor Start-up — P-101A/B","Start and run-in P-101A/B, record vibration and current","electrical","2026-09-15","2026-09-18",2,"nos",["ELE-ENG-1093","SEQ-PMP-1061"],None)
act("ELE-MTR-1095","1.4.8.2","Motor Start-up — CS-01","Start and run-in CS-01 compressor, record vibration","electrical","2026-09-15","2026-09-18",1,"nos",["ELE-ENG-1093","SEQ-SKD-1063"],None)

# ── INSTRUMENTATION (16) ────────────────────────────────────────────────────
act("INS-TRN-1096","1.5.1.1","Transmitter Calibration — Level","Calibrate all level transmitters, 12 nos","instrumentation","2026-08-01","2026-08-10",12,"nos",[],None)
act("INS-TRN-1097","1.5.1.2","Transmitter Calibration — Pressure","Calibrate all pressure transmitters, 18 nos","instrumentation","2026-08-01","2026-08-12",18,"nos",[],None)
act("INS-TRN-1098","1.5.1.3","Transmitter Calibration — Temperature","Calibrate all temperature transmitters, 14 nos","instrumentation","2026-08-05","2026-08-14",14,"nos",[],None)
act("INS-FLD-1099","1.5.2.1","Field Instrument Installation — Level","Mount level transmitters on vessels, 12 nos","instrumentation","2026-08-15","2026-08-28",12,"nos",["INS-TRN-1096","SEQ-VSL-1055","SEQ-VSL-1057","SEQ-TKN-1066"],None)
act("INS-FLD-1100","1.5.2.2","Field Instrument Installation — Pressure","Mount pressure transmitters on piping and vessels, 18 nos","instrumentation","2026-08-18","2026-09-01",18,"nos",["INS-TRN-1097","PIP-ERC-1030"],None)
act("INS-FLD-1101","1.5.2.3","Field Instrument Installation — Temperature","Mount thermowells and RTDs, 14 nos","instrumentation","2026-08-20","2026-09-03",14,"nos",["INS-TRN-1098","SEQ-EXC-1059"],None)
act("INS-FND-1102","1.5.3.1","Control Valve Installation","Install and stroke-test control valves, 8 nos","instrumentation","2026-08-25","2026-09-08",8,"nos",["PIP-ERC-1030","PIP-ERC-1031"],None)
act("INS-FND-1103","1.5.3.2","Safety Valve Installation","Install and set PSVs on vessels and headers, 6 nos","instrumentation","2026-08-25","2026-09-05",6,"nos",["SEQ-VSL-1055","SEQ-TKN-1066"],None)
act("INS-ICS-1104","1.5.4.1","Junction Box Installation","Install JB-01 through JB-06 in field, 6 nos","instrumentation","2026-08-20","2026-09-01",6,"nos",["CIV-APN-1022"],None)
act("INS-ICS-1105","1.5.4.2","Marshalling Cabinet Wiring","Wire marshalling cabinet, 186 terminations","instrumentation","2026-09-03","2026-09-12",186,"nos",["ELE-FLT-1085","INS-ICS-1104"],None)
act("INS-ICS-1106","1.5.4.3","DCS Panel Integration","Integrate marshalling signals into DCS","instrumentation","2026-09-13","2026-09-18",1,"nos",["INS-ICS-1105"],None)
act("INS-LOOP-1107","1.5.5.1","Loop Check — All Instruments","Perform loop check field to DCS, 62 loops","instrumentation","2026-09-14","2026-09-22",62,"nos",["INS-FLD-1099","INS-FLD-1100","INS-FLD-1101","INS-ICS-1106"],None)
act("INS-LOOP-1108","1.5.5.2","Control Valve Loop Check","Full stroke test of CVs from DCS, 8 CVs","instrumentation","2026-09-18","2026-09-22",8,"nos",["INS-FND-1102","INS-ICS-1106"],None)
act("INS-SFT-1109","1.5.6.1","SIS Logic Test","Verify SIS logic for SIL-2 functions, 4 SIFs","instrumentation","2026-09-20","2026-09-25",4,"nos",["INS-LOOP-1107","INS-FND-1103"],None)
act("INS-SFT-1110","1.5.6.2","ESD System Functional Test","Full ESD functional test with cause & effect matrix","instrumentation","2026-09-23","2026-09-26",1,"nos",["INS-SFT-1109"],None)
act("INS-DOC-1111","1.5.7.1","As-Built Instrument Datasheets","Issue final as-built datasheets and loop diagrams","instrumentation","2026-09-20","2026-09-28",1,"nos",["INS-LOOP-1107"],None)

# ── HSE (10) ────────────────────────────────────────────────────────────────
act("HSE-IND-1112","1.6.1.1","Pre-Mobilisation Safety Induction","Safety induction for all mobilised workforce, 120 nos","hse","2026-05-28","2026-06-01",120,"nos",[],None)
act("HSE-BBS-1113","1.6.1.2","BBS Observation Programme Launch","Implement BBS observation programme across site","hse","2026-06-02","2026-06-08",1,"nos",["HSE-IND-1112"],None)
act("HSE-JSA-1114","1.6.2.1","JSA — Piling Operations","Job Safety Analysis for piling works","hse","2026-06-12","2026-06-14",1,"nos",["HSE-IND-1112"],None)
act("HSE-JSA-1115","1.6.2.2","JSA — Heavy Lifting","Job Safety Analysis for all heavy lifts > 10 MT","hse","2026-06-15","2026-06-18",1,"nos",["HSE-IND-1112"],None)
act("HSE-PMT-1116","1.6.3.1","Work Permit System Activation","Permit-to-Work system for hot work, confined space, height","hse","2026-06-05","2026-06-10",1,"nos",["HSE-IND-1112"],None)
act("HSE-NCR-1117","1.6.3.2","NCR Register & Close-out Process","Non-Conformance Register with 15-day close-out target","hse","2026-06-10","2026-06-15",1,"nos",["HSE-PMT-1116"],None)
act("HSE-SPC-1118","1.6.4.1","Scaffolding Inspection Programme","Weekly scaffolding inspection and tagging, 4 cycles","hse","2026-07-01","2026-08-28",4,"nos",["HSE-IND-1112"],None)
act("HSE-FRE-1119","1.6.5.1","Fire Extinguisher Audit","Verify all portable fire extinguishers, 24 nos","hse","2026-08-15","2026-08-18",24,"nos",["HSE-IND-1112"],None)
act("HSE-EMG-1120","1.6.5.2","Emergency Drill — Tank Fire","Tabletop and live drill for TK-1 fire scenario","hse","2026-09-05","2026-09-08",1,"nos",["SEQ-TKN-1068"],None)
act("HSE-DSH-1121","1.6.6.1","Site Safety Statistics Report","Monthly safety stats — LTI, near-miss, first-aid","hse","2026-06-01","2026-09-28",4,"nos",["HSE-BBS-1113"],None)

assert len(activities) == 120, f"Expected 120, got {len(activities)}"
with open("dataset/baseline_schedule.json", "w", encoding="utf-8") as f:
    json.dump(activities, f, indent=2)
print(f"[A] baseline_schedule.json — {len(activities)} activities written")

# ══════════════════════════════════════════════════════════════════════════════
# B) DAILY PROGRESS REPORTS — 10 files
# ══════════════════════════════════════════════════════════════════════════════

dprs = []

# --- DPR Day 1: 03 Aug 2026 ---
dprs.append(("2026-08-03", 1, [
    ("Foundation concreting for pipe rack pedestals P7 to P12", "CIV-FDN-1007"),
    ("Tank TK-1 shell erection", "SEQ-TKN-1066"),
    ("Backfilling around equipment foundation EF-2 and EF-3", "CIV-BKL-1012"),
    ("Equipment foundation for CS-01 concreting", "CIV-FND-1018"),
    ("24 inch main header P-1001 spool erection", "PIP-ERC-1030"),
    ("Pipe rack Tier 2 steel erection", "PIP-RCK-1024"),
    ("12 inch transfer line spool fabrication", "PIP-SPL-1026"),
    ("Vessel V-101 separator arrived", "SEQ-VSL-1054"),
    ("Exchanger E-101 setting on foundation", "SEQ-EXC-1059"),
    ("Earthing grid installation", "ELE-GRD-1086"),
    ("BBS observations", "HSE-BBS-1113"),
    ("NCR opened for improper scaffolding tag", "HSE-NCR-1117"),
    ("Weekly safety stats", "HSE-DSH-1121"),
    ("material delivery status report", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 03/08/2026  |  Weather: Hot, 38C  |  Wind: 12 km/h SW
Contractor: ABC Infra Pvt Ltd  |  Project: OIL Well-Site Duliajan
Prepared by: Vikram Saikia, Site Engineer

1. CIVIL WORKS
   a) Foundation concreting for pipe rack pedestals P7 to P12 completed yesterday (2 Aug). Total 24 m3 poured. Cubes taken for compressive strength test.
   b) Tank TK-1 shell erection going good — currently on 4th course (lower courses 1-3 completed). Crew working 12-hr shift.
   c) Backfilling around equipment foundation EF-2 and EF-3 started today. Using roller compactor, about 40% done.
   d) Equipment foundation for CS-01 concreting — pour completed on 30 Jul, curing ongoing. Water ponding observed on site.

2. PIPING
   a) 24 inch main header P-1001 spool erection — 6 nos spools erected on Tier 1 rack. 12 more remaining. Fit-up quality good.
   b) Pipe rack Tier 2 steel erection delayed by 2 days due to crane breakdown. Erection of 12 MT done out of 28 MT planned.
   c) 12 inch transfer line spool fabrication — 8 nos completed in shop, 4 more to go.

3. EQUIPMENT
   a) Vessel V-101 separator arrived from Kolkata by trailer today. Unloading planned tomorrow.
   b) Exchanger E-101 setting on foundation completed 31 Jul. Alignment check pending.

4. ELECTRICAL
   a) Earthing grid installation — about 60% of total conductor laid. Working near pipe rack area.

5. HSE
   a) Weekly safety stats — 0 LTI, 2 near-miss reported (both at height work). BBS observations: 18 this week.
   b) NCR opened for improper scaffolding tag near Zone B. Corrective action taken same day.

6. MATERIALS
   a) Material delivery status report — 3 truckloads received today (rebar, cement, angle iron). GRN pending.

REMARKS:
- Crane rental company asked to expedite crane repair — expected back by 5 Aug.
- TK-1 hydrotest now scheduled 25 Aug instead of 23 Aug due to shell erection delay.
"""))

# --- DPR Day 2: 06 Aug 2026 ---
dprs.append(("2026-08-06", 2, [
    ("Backfilling equip foundation EF-1, EF-2, EF-3", "CIV-BKL-1012"),
    ("Containment bund wall Zone A", "CIV-BND-1013"),
    ("Drainage channels perimeter", "CIV-DWG-1015"),
    ("24 inch P-1001 spool erection", "PIP-ERC-1030"),
    ("8 inch flare header P-1003 spool fabrication", "PIP-SPL-1027"),
    ("Spool erection 12 inch P-1002", "PIP-ERC-1031"),
    ("V-101 separator jacking", "SEQ-VSL-1055"),
    ("V-102 filter vessel arrived", "SEQ-VSL-1056"),
    ("Compressor skid CS-01 delivery", "SEQ-SKD-1062"),
    ("Level transmitter calibration", "INS-TRN-1096"),
    ("Pressure transmitter calib", "INS-TRN-1097"),
    ("Scaffolding inspection", "HSE-SPC-1118"),
    ("Permits to work issued", "HSE-PMT-1116"),
    ("soil compaction test results submitted", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 06/08/2026  |  Weather: Partly cloudy, 35C
Contractor: ABC Infra Pvt Ltd
Prepared by: Vikram Saikia

1. CIVIL
   - Backfilling equip foundation EF-1, EF-2, EF-3 completed yesterday (5 Aug). 180 m3 total placed. Final compaction test passed.
   - Containment bund wall Zone A — rebar fixing ongoing. About 65% rebar placed. Formwork carpenter crew absent today (2 men on leave).
   - Drainage channels perimeter — excavation started near south boundary. 40 lm dug out of 160 lm total.

2. PIPING
   - 24 inch P-1001 spool erection — 12 spools erected now (out of 18). Progressing well on Tier 1. 6 spools fabricated in shop awaiting transport.
   - 8 inch flare header P-1003 spool fabrication started in workshop. 3 nos done, 11 to go.
   - Spool erection 12 inch P-1002 started — 2 spools fitted on rack. Crain operator issue slowing us.

3. EQUIPMENT
   - V-101 separator jacking started 4 Aug, now on 2nd lift. 3 more lifts to go. Expected setting by 9 Aug.
   - V-102 filter vessel arrived from fabrication yard. Stored at laydown area.
   - Compressor skid CS-01 delivery from yard — trailer mobilised, expected on site by 10 Aug.
   - Soil compaction test results submitted to QA. All zones meeting 95% MDD.

4. INSTRUMENTATION
   - Level transmitter calibration — 6 out of 12 done in workshop. Calibration report being prepared.
   - Pressure transmitter calib — workshop work started. 4 nos completed.

5. HSE
   - Scaffolding inspection done on 5 Aug. 3 tags expired, re-tagged.
   - Emergency contact list updated and posted at all muster points.
   - Permits to work issued: 4 hot work, 2 confined space, 1 height.

REMARKS:
- Crane is back. Resume heavy lifts from tomorrow.
- V-102 setting to begin next week after foundation pad final prep.
"""))

# --- DPR Day 3: 11 Aug 2026 ---
dprs.append(("2026-08-11", 3, [
    ("Grade beams pipe rack", "CIV-GBM-1014"),
    ("Firewater pit Zone B", "CIV-PLG-1017"),
    ("Flooring MCC room", "CIV-FLR-1020"),
    ("24 inch P-1001 spool erection", "PIP-ERC-1030"),
    ("4 inch utility water P-1010 spool erection", "PIP-ERC-1033"),
    ("Pipe support installation Tier 1", "PIP-SUP-1049"),
    ("Tier 2 pipe rack steel", "PIP-RCK-1024"),
    ("V-101 separator setting", "SEQ-VSL-1055"),
    ("V-102 filter jacking", "SEQ-VSL-1057"),
    ("Exchanger E-101 nozzle orientation", "SEQ-PIP-1074"),
    ("Pump P-101A delivered", "SEQ-PMP-1060"),
    ("HT cable laying", "ELE-CBL-1076"),
    ("MCC panels installed", "ELE-SWG-1082"),
    ("Transformer TR-01 oil filling", "ELE-TRF-1080"),
    ("Calibrated level transmitters", "INS-TRN-1096"),
    ("Junction boxes JB-01, JB-02, JB-03 installed", "INS-ICS-1104"),
    ("Transmitter mounting on V-101", "INS-FLD-1099"),
    ("TK-1 shell erection 6th course", "SEQ-TKN-1066"),
    ("24 inch main header P-1002 flange start", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 11/08/2026  |  Weather: Clear sky, 40C
Contractor: ABC Infra Pvt Ltd
Prepared by: Rajesh Phukan, Asst. Engineer

1. CIVIL
   - Grade beams pipe rack: pour of M30 concrete completed for section between P4-P8 on 9 Aug. Remaining section P8-P12 planned 13 Aug.
   - Firewater pit Zone B: excavation done. Lining work started — 12 m3 of 45 m3 placed.
   - Flooring MCC room — tiles ka kaam chalu hai. 40 m2 out of 95 m2 done. Kal se bhi chalega.

2. PIPING
   - 24 inch P-1001 spool erection: ALL 18 spools now erected on rack! Flange management start from tomorrow.
   - 4 inch utility water P-1010 spool erection started — 3 spools up, 5 remaining. Alignment with pipe rack supports needs attention.
   - Pipe support installation Tier 1: 98 out of 145 supports done. Grinding marks on some supports to be rectified.
   - Tier 2 pipe rack steel is almost done, only 4 MT left. Erection should close by 13 Aug.
   - 24 inch main header P-1002 flange start — P-1002 flange boltup begins.

3. EQUIPMENT
   - V-101 separator: setting complete on 9 Aug. Nozzle-ready inspection scheduled.
   - V-102 filter: jacking started. 1st lift done, setting expected by 15 Aug.
   - Exchanger E-101: nozzle orientation verified, blind flanges installed. Ready for piping tie-in.
   - Pump P-101A delivered to pump house 8 Aug. P-101B arriving 13 Aug.

4. ELECTRICAL
   - HT cable laying: 800 m of 33kV cable laid from substation to MCC trench. About 400 m more to go.
   - MCC panels installed — all 6 panels set in position. Wiring connections started.
   - Transformer TR-01 oil filling in progress — 8 tonnes filled, moisture test passed.

5. INSTRUMENTATION
   - Calibrated 10 of 12 level transmitters. 2 remaining — low-range LT needs re-ranging.
   - Junction boxes JB-01, JB-02, JB-03 installed in field. Tagging done.
   - Transmitter mounting on V-101: 4 LTs installed on vessel. Working on V-102 mounts next week.

REMARKS:
- 24 inch hydrotest scheduled for 20 Aug. Need flange management complete by 18 Aug.
- TK-1 shell erection 6th course completed today. 2 more courses to close roof ring.
"""))

# --- DPR Day 4: 15 Aug 2026 (Independence Day — limited work) ---
dprs.append(("2026-08-15", 4, [
    ("8 inch flare header P-1003 spool fabrication", "PIP-SPL-1027"),
    ("6 inch drain header P-1015 fabrication", "PIP-SPL-1029"),
    ("Header skid HS-01 delivered", "SEQ-SKD-1064"),
    ("V-102 filter vessel setting", "SEQ-VSL-1057"),
    ("TK-1 shell erection on 7th course", "SEQ-TKN-1066"),
    ("Pump P-101B delivered", "SEQ-PMP-1060"),
    ("Fire extinguisher audit", "HSE-FRE-1119"),
    ("Independence Day safety briefing", "HSE-IND-1112"),
    ("permit for confined space entry in TK-1", "HSE-PMT-1116"),
], """DAILY PROGRESS REPORT
Date: 15/08/2026  |  Weather: Overcast, 32C  |  Holiday: Independence Day
Contractor: ABC Infra Pvt Ltd
Prepared by: Vikram Saikia

NOTE: Half-day work per govt order. Essential activities only.

1. PIPING
   - 8 inch flare header P-1003 spool fabrication — total 10 spools completed in shop. 4 remaining. One fab welder absent.
   - 6 inch drain header P-1015 fabrication just started. 2 spools done, 8 more.

2. EQUIPMENT
   - Header skid HS-01 delivered from yard. Stored at Zone A laydown.
   - V-102 filter vessel setting completed 14 Aug. Alignment verified. Nozzle caps installed.
   - TK-1 shell erection on 7th course. One more course to go before roof ring.
   - Pump P-101B delivered. Both pumps now in pump house. Setting to begin Monday.

3. HSE
   - Independence Day safety briefing conducted. Special emphasis on holiday work safety for essential crew.
   - Fire extinguisher audit: 22 of 24 checked and tagged. 2 cylinders need refilling.
   - Permit issued for confined space entry in TK-1 for internal inspection.
"""))

# --- DPR Day 5: 19 Aug 2026 ---
dprs.append(("2026-08-19", 5, [
    ("Cable tray buried Zone A+B", "CIV-APN-1022"),
    ("Grade beams P8-P12 pour", "CIV-GBM-1014"),
    ("Plastering MCC room walls", "CIV-PLT-1021"),
    ("24 inch P-1001 flange management", "PIP-FLG-1035"),
    ("12 inch P-1002 flange bolt-up", "PIP-FLG-1036"),
    ("12 inch P-1002 hydrotest", "PIP-HYT-1041"),
    ("Pipe support Tier 2", "PIP-SUP-1050"),
    ("CS-01 compressor skid set", "SEQ-SKD-1063"),
    ("HS-01 header skid setting", "SEQ-SKD-1065"),
    ("Pump alignment P-101A", "SEQ-ALN-1070"),
    ("TK-1 shell 8th course completed", "SEQ-TKN-1066"),
    ("HT cable laying complete", "ELE-CBL-1076"),
    ("LT cable laying started", "ELE-CBL-1077"),
    ("Lightning protection pipe rack", "ELE-GRD-1087"),
    ("Temperature transmitters calibrated", "INS-TRN-1098"),
    ("Pressure transmitters calibrated", "INS-TRN-1097"),
    ("Transmitter mounting on V-102", "INS-FLD-1099"),
    ("Junction box JB-04 and JB-05 installed", "INS-ICS-1104"),
    ("BBS observations", "HSE-BBS-1113"),
    ("Weekly safety stats", "HSE-DSH-1121"),
    ("line erected for 8 inch flare", "PIP-ERC-1032"),
    ("pipe rack column steel placed", "PIP-RCK-1023"),
], """DAILY PROGRESS REPORT
Date: 19/08/2026  |  Weather: Light rain in morning, humid
Contractor: ABC Infra Pvt Ltd
Prepared by: Vikram Saikia

1. CIVIL
   - Cable tray buried Zone A+B: 180 lm installed out of 280 lm. Trench backfilling done in sections where trays placed.
   - Grade beams P8-P12 pour completed 17 Aug. Full pipe rack grade beam line now complete.
   - Plastering MCC room walls — shuru ho gaya. One coat done on 2 walls out of 4.

2. PIPING
   - 24 inch P-1001 flange management: 28 of 36 flanges bolted up. Torque readings recorded. 8 flanges in welding area still pending.
   - 12 inch P-1002 flange bolt-up complete — all 24 flanges done. Ready for hydrotest.
   - 12 inch P-1002 hydrotest done today — 4 sections, all passed at 1.5x design. No leakage observed.
   - Pipe support Tier 2: all 88 supports installed. QC check: 3 rejected for incorrect elevation. Rectification in progress.
   - Line erected for 8 inch flare header — 10 of 14 spools up.
   - Pipe rack column steel placed for Tier 1 — final section completed.

3. EQUIPMENT
   - CS-01 compressor skid set on foundation 18 Aug. Level check: within 0.5 mm tolerance. Epoxy grouting scheduled.
   - HS-01 header skid: jacking complete. Setting on foundation — anchor bolt tightening in progress.
   - Pump alignment P-101A: laser alignment done, readings within tolerance. P-101B alignment next.
   - TK-1 shell: 8th course completed! Roof ring level reached. Roof installation to start.

4. ELECTRICAL
   - HT cable laying complete — full 1.2 km from substation to MCC trench. Backfilled.
   - LT cable laying started — 200 m of 660V cable laid for pump connections.
   - Lightning protection pipe rack: 12 of 18 air terminals installed.

5. INSTRUMENTATION
   - All 14 temperature transmitters calibrated and certified. Reports filed.
   - 8 pressure transmitters calibrated. 10 more to go.
   - Transmitter mounting on V-102: all 4 level instruments installed.
   - Junction box JB-04 and JB-05 installed in field. JB-06 next.

6. HSE
   - Near-miss: scaffold platform board loose at Zone B. Area cordoned, board replaced. JSA updated.
   - Weekly stats: 0 LTI, 1 near-miss. BBS observations 22 this week (improvement from last week's 18).
"""))

# --- DPR Day 6: 23 Aug 2026 ---
dprs.append(("2026-08-23", 6, [
    ("Drainage channels", "CIV-DWG-1015"),
    ("Fencing chain-link", "CIV-FNC-1016"),
    ("Floor tiles MCC room", "CIV-FLR-1020"),
    ("24 inch P-1001 flange management", "PIP-FLG-1035"),
    ("8 inch P-1003 flare header erection", "PIP-ERC-1032"),
    ("8 inch P-1003 flange bolt-up", "PIP-FLG-1037"),
    ("6 inch P-1015 drain header erection", "PIP-ERC-1034"),
    ("4 inch P-1010 utility water erection", "PIP-ERC-1033"),
    ("4 inch P-1010 hydrotest", "PIP-HYT-1043"),
    ("TK-1 roof installation", "SEQ-TKN-1067"),
    ("TK-1 hydrotest", "SEQ-TKN-1068"),
    ("V-101 nozzle-ready inspection", "SEQ-PIP-1073"),
    ("CS-01 epoxy grouting", "SEQ-ALN-1071"),
    ("HS-01 grouting", "SEQ-ALN-1072"),
    ("LT cable laying", "ELE-CBL-1077"),
    ("Control cable laying", "ELE-CBL-1078"),
    ("Cable termination HT", "ELE-FLT-1083"),
    ("Pressure transmitters calibrated", "INS-TRN-1097"),
    ("Field instrument mounting pressure", "INS-FLD-1100"),
    ("Field instrument mounting temperature", "INS-FLD-1101"),
    ("Control valve installation", "INS-FND-1102"),
    ("Safety valve PSV-01, PSV-02, PSV-03", "INS-FND-1103"),
    ("NCR closed scaffolding", "HSE-NCR-1117"),
    ("Scaffolding inspection", "HSE-SPC-1118"),
    ("cable laying for 6.6kV transformer", "ELE-TRF-1080"),
    ("BBS walk at night shift", "HSE-BBS-1113"),
    ("welding consumable inventory check", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 23/08/2026  |  Weather: Clear, 37C
Contractor: ABC Infra Pvt Ltd
Prepared by: Rajesh Phukan

1. CIVIL
   - Drainage channels: 120 lm out of 160 lm complete. Working on east section now.
   - Fencing: chain-link installation 320 lm done, remaining 160 lm near north gate. 2 gates installed.
   - Floor tiles MCC room: kaam khatam. All 95 m2 done and grouted. Cleaning pending.

2. PIPING
   - 24 inch P-1001 flange management: all 36 flanges bolted up and torqued. Ready for hydro.
   - 8 inch P-1003 flare header erection: 10 of 14 spools erected. Good progress.
   - 8 inch P-1003 flange bolt-up: 16 of 28 done.
   - 6 inch P-1015 drain header erection: 6 of 10 spools up.
   - 4 inch P-1010 utility water: all 8 spools erected. Flange bolt-up complete. Ready for hydro.
   - 4 inch P-1010 hydrotest: 3 sections tested, all passed.

3. EQUIPMENT
   - TK-1 roof installation complete. Pontoon roof welded and tested.
   - TK-1 hydrotest started 21 Aug — water filling in progress. Level at 60%. Expected completion 25 Aug.
   - V-101 nozzle-ready inspection: all 6 nozzles verified, blind flanges torque-checked.
   - CS-01 epoxy grouting completed 22 Aug. Anchor bolts torqued to spec.
   - HS-01 grouting done. Anchor bolts torqued. Skid alignment verified.

4. ELECTRICAL
   - LT cable laying: 680 m complete for all pump motors. Route verified.
   - Control cable laying: 2200 m of 3400 m laid. Working on east pipe rack section.
   - Cable termination HT: 16 of 24 ends terminated. Heat-shrink kits applied and tested.
   - Cable laying for 6.6kV transformer — TR-01 secondary cables routed.

5. INSTRUMENTATION
   - All 18 pressure transmitters calibrated and certified.
   - Field instrument mounting — pressure: 10 of 18 PTs installed on piping.
   - Field instrument mounting — temperature: 8 of 14 RTDs mounted on exchangers.
   - Control valve installation: 3 of 8 CVs installed and stroke-tested.
   - Safety valve PSV-01, PSV-02, PSV-03 installed on V-101. Set pressure verified.

6. HSE
   - NCR closed: scaffolding tag issue from 3 Aug. Satisfactory close-out with photo evidence.
   - Scaffolding inspection: all platforms re-tagged this week. 0 expired tags.
   - BBS walk at night shift conducted. 2 observations noted.
   - Welding consumable inventory check: E6013 stock low. Reorder placed with supplier.
"""))

# --- DPR Day 7: 27 Aug 2026 ---
dprs.append(("2026-08-27", 7, [
    ("Cable tray buried Zone B completed", "CIV-APN-1022"),
    ("Drainage channels", "CIV-DWG-1015"),
    ("24 inch P-1001 hydrotest", "PIP-HYT-1040"),
    ("8 inch P-1003 flare header erection complete", "PIP-ERC-1032"),
    ("8 inch P-1003 flange management complete", "PIP-FLG-1037"),
    ("8 inch P-1003 hydrotest", "PIP-HYT-1042"),
    ("6 inch P-1015 drain header erection", "PIP-ERC-1034"),
    ("6 inch P-1015 flange bolt-up", "PIP-FLG-1039"),
    ("Skid piping CS-01", "PIP-SKN-1051"),
    ("P&ID punch list walkdown", "PIP-PCD-1053"),
    ("TK-1 hydrotest complete", "SEQ-TKN-1068"),
    ("Pump alignment P-101B", "SEQ-ALN-1070"),
    ("Equipment foundation settlement survey", "SEQ-CMN-1075"),
    ("Cable termination HT", "ELE-FLT-1083"),
    ("Cable termination LT", "ELE-FLT-1084"),
    ("Control cable laying", "ELE-CBL-1078"),
    ("Insulation resistance testing HT", "ELE-IGT-1090"),
    ("Control valve installation", "INS-FND-1102"),
    ("Safety valve PSV-04, PSV-05, PSV-06", "INS-FND-1103"),
    ("Pressure transmitter mounting", "INS-FLD-1100"),
    ("Marshalling cabinet wiring", "INS-ICS-1105"),
    ("rebar fixing for tank foundation ringwall", "CIV-FDN-1009"),
    ("tank foundation settlement reading TK-1", "CIV-FDN-1009"),
    ("construction joint treatment at P7-P8", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 27/08/2026  |  Weather: Overcast, rain expected
Contractor: ABC Infra Pvt Ltd
Prepared by: Vikram Saikia

1. CIVIL
   - Cable tray buried: remaining 100 lm completed for Zone B. Full 280 lm now installed.
   - Drainage channels: 140 of 160 lm done. Last 20 lm near north gate — held up by fencing work.
   - Rebar fixing for tank foundation ringwall: additional reinforcement at expansion joint locations, ongoing.
   - Tank foundation settlement reading TK-1: settlement monitoring survey completed. All within limits.
   - Construction joint treatment at P7-P8: surface preparation and epoxy application for crack sealing.

2. PIPING
   - 24 inch P-1001 hydrotest: 4 of 6 test sections completed, all passed. Remaining 2 sections tomorrow.
   - 8 inch P-1003 flare header: all 14 spools erected. Full flange management 28 of 28 done.
   - 8 inch P-1003 hydrotest: 2 of 5 sections done. 3 sections tomorrow.
   - 6 inch P-1015 drain header: 8 of 10 spools erected. 2 remaining — special long spool being fabbed.
   - 6 inch P-1015 flange bolt-up: 12 of 20 done.
   - Skid piping CS-01: 4 of 6 spools fabricated. Erection started — 2 spools fitted on skid.
   - P&ID punch list walkdown: started on 7 Sep. Identified 12 Category A items and 28 Category B items.

3. EQUIPMENT
   - TK-1 hydrotest: ALL PASSED. 48-hour retention complete. Water drained. Tank inspected from inside — no defects.
   - Pump alignment P-101B: laser alignment done. Both pumps aligned and grouted.
   - Equipment foundation settlement survey: readings taken. All within 2 mm tolerance.

4. ELECTRICAL
   - Cable termination HT: 20 of 24 ends done.
   - Cable termination LT: 30 of 48 ends done.
   - Control cable laying: 3000 of 3400 m laid.
   - Insulation resistance testing HT: started on 8 cables, all passed at 1kV DC.

5. INSTRUMENTATION
   - Control valve installation: 6 of 8 installed. Remaining 2 on 8 inch header.
   - Safety valve: PSV-04, PSV-05 installed on V-102. PSV-06 on header HS-01.
   - Pressure transmitter mounting: 14 of 18 on piping. 4 remaining — waiting on pipe support completion.
   - Marshalling cabinet wiring: 80 of 186 terminations done. Working steadily.
"""))

# --- DPR Day 8: 02 Sep 2026 ---
dprs.append(("2026-09-02", 8, [
    ("Drainage channels complete", "CIV-DWG-1015"),
    ("Plot boundary fencing complete", "CIV-FNC-1016"),
    ("Plastering MCC room", "CIV-PLT-1021"),
    ("24 inch P-1001 hydrotest complete", "PIP-HYT-1040"),
    ("8 inch P-1003 hydrotest complete", "PIP-HYT-1042"),
    ("6 inch P-1015 drain header erection complete", "PIP-ERC-1034"),
    ("6 inch P-1015 flange bolt-up complete", "PIP-FLG-1039"),
    ("6 inch P-1015 hydrotest", "PIP-HYT-1044"),
    ("Pipe insulation 24 inch P-1001", "PIP-INS-1045"),
    ("Pipe insulation 12 inch P-1002", "PIP-INS-1046"),
    ("Skid piping CS-01 complete", "PIP-SKN-1051"),
    ("P&ID punch list close-out", "PIP-PCD-1053"),
    ("TK-1 internal coating", "SEQ-TKN-1069"),
    ("Pump run-in test P-101A", "ELE-MTR-1094"),
    ("Cable termination HT complete", "ELE-FLT-1083"),
    ("Cable termination LT", "ELE-FLT-1084"),
    ("Cable termination control", "ELE-FLT-1085"),
    ("Insulation resistance testing HT complete", "ELE-IGT-1090"),
    ("Insulation resistance testing LT", "ELE-IGT-1091"),
    ("Lighting circuit testing", "ELE-LIG-1089"),
    ("Marshalling cabinet wiring", "INS-ICS-1105"),
    ("Loop check", "INS-LOOP-1107"),
    ("Control valve installation complete", "INS-FND-1102"),
    ("All 14 RTDs mounted", "INS-FLD-1101"),
    ("Emergency drill TK-1 fire", "HSE-EMG-1120"),
    ("Fire extinguisher audit", "HSE-FRE-1119"),
    ("safety induction for new batch of 30 workers", "HSE-IND-1112"),
    ("cable tray 6.6kV from substation", "NO_MATCH"),
    ("valve set pressure verified on PSV-03", "INS-FND-1103"),
    ("scaffold dismantling at Zone A", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 02/09/2026  |  Weather: Rain since morning, intermittent
Contractor: ABC Infra Pvt Ltd
Prepared by: Rajesh Phukan

1. CIVIL
   - Drainage channels: ALL 160 lm complete. Grating installed at 8 points.
   - Plot boundary fencing: FULLY COMPLETE. 480 lm with 3 gates, all locked.
   - Plastering MCC room: second coat done. Painting to start.

2. PIPING
   - 24 inch P-1001 hydrotest: ALL 6 sections passed. Full line hydro complete.
   - 8 inch P-1003 hydrotest: ALL 5 sections passed.
   - 6 inch P-1015 drain header: all 10 spools erected. 20 of 20 flanges bolted.
   - 6 inch P-1015 hydrotest: all 3 sections passed.
   - 4 inch P-1010 hydro: already complete (done earlier).
   - Pipe insulation 24 inch P-1001 started — mineral wool wrapping on 40 m2 done. Aluminium cladding next.
   - Pipe insulation 12 inch P-1002 started — 20 m2 done.
   - Skid piping CS-01: all 6 spools fabricated and erected. Flange management complete.
   - P&ID punch list close-out: 8 of 12 Cat A closed. 20 of 28 Cat B closed.

3. EQUIPMENT
   - TK-1 internal coating: epoxy lining application started. 120 m2 done out of 420 m2.
   - Pump run-in test P-101A: vibration readings within limits. Current draw normal.

4. ELECTRICAL
   - Cable termination HT: ALL 24 ends complete.
   - Cable termination LT: 44 of 48 ends. 4 remaining at motor side P-102A.
   - Cable termination control: 120 of 186 terminations done.
   - Insulation resistance testing HT: all 24 cables tested, ALL PASSED.
   - LT cable laying fully complete — confirmed.
   - Insulation resistance testing LT started: 20 of 48 tested, all OK.
   - Lighting circuit testing: 8 of 16 circuits done.
   - Cable tray 6.6kV from substation — buried routing verified.

5. INSTRUMENTATION
   - Marshalling cabinet wiring: 140 of 186 terminations.
   - Loop check started: 15 of 62 loops completed from field to DCS.
   - Control valve installation: ALL 8 CVs installed and stroke-tested.
   - All 14 RTDs mounted on exchangers and vessels.
   - Valve set pressure verified on PSV-03.

6. HSE
   - Emergency drill TK-1 fire scenario: tabletop conducted 1 Sep, live drill planned 5 Sep.
   - Fire extinguisher audit: 24 of 24 complete. 2 refilled cylinders returned.
   - Safety induction for new batch of 30 workers completed.
   - Scaffold dismantling at Zone A: lower tiers removed after bund wall completion. Upper tier remains.
"""))

# --- DPR Day 9: 08 Sep 2026 ---
dprs.append(("2026-09-08", 9, [
    ("Pipe insulation 24 inch P-1001 complete", "PIP-INS-1045"),
    ("Pipe insulation 12 inch P-1002 complete", "PIP-INS-1046"),
    ("Pipe insulation 8 inch P-1003", "PIP-INS-1047"),
    ("Paint coating pipe rack", "PIP-PAI-1048"),
    ("P&ID punch list walkdown", "PIP-PCD-1053"),
    ("TK-1 internal coating complete", "SEQ-TKN-1069"),
    ("Cable termination LT complete", "ELE-FLT-1084"),
    ("Control cable termination complete", "ELE-FLT-1085"),
    ("Insulation resistance testing LT complete", "ELE-IGT-1091"),
    ("Lighting circuit testing", "ELE-LIG-1089"),
    ("Area lighting installation", "ELE-LIG-1088"),
    ("Marshalling cabinet wiring complete", "INS-ICS-1105"),
    ("DCS panel integration", "INS-ICS-1106"),
    ("Loop check", "INS-LOOP-1107"),
    ("Control valve loop check", "INS-LOOP-1108"),
    ("As-built datasheets", "INS-DOC-1111"),
    ("Emergency drill live", "HSE-EMG-1120"),
    ("BBS observations", "HSE-BBS-1113"),
    ("line isolation for TK-1 paint", "NO_MATCH"),
    ("pipe support marking on ground for Tier 2", "PIP-SUP-1050"),
    ("insulation on 12 inch P-1015", "NO_MATCH"),
    ("spool marking and numbering in workshop", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 08/09/2026  |  Weather: Partly cloudy, pleasant
Contractor: ABC Infra Pvt Ltd
Prepared by: Vikram Saikia

1. PIPING
   - Pipe insulation 24 inch P-1001: ALL 120 m2 complete. Mineral wool + aluminium cladding.
   - Pipe insulation 12 inch P-1002: ALL 65 m2 complete.
   - Pipe insulation 8 inch P-1003: 50 of 80 m2 done.
   - Paint coating pipe rack: 400 of 850 m2 done. 3-coat epoxy system. Slow progress due to humidity — drying time between coats increased.
   - P&ID punch list walkdown: started on 7 Sep. Identified 12 Category A items and 28 Category B items across piping and instrument disciplines.
   - Line isolation for TK-1 paint work area — bleeder valves installed.
   - Pipe support marking on ground for Tier 2 — layout marking for remaining 3 supports.

2. EQUIPMENT
   - TK-1 internal coating: ALL 420 m2 complete. Curing 48 hours. Visual inspection passed.

3. ELECTRICAL
   - Cable termination LT: ALL 48 ends complete.
   - Control cable termination: ALL 186 terminations complete.
   - Insulation resistance testing LT: ALL 48 cables tested, passed.
   - Lighting circuit testing: 14 of 16 done.
   - Area lighting installation: 24 of 32 lights installed. Working on east pipe rack section.

4. INSTRUMENTATION
   - Marshalling cabinet wiring: ALL 186 terminations complete.
   - DCS panel integration: started 5 Sep. Signal mapping in progress. 40% done.
   - Loop check: 38 of 62 loops done.
   - Control valve loop check from DCS: 4 of 8 CVs looped and verified.
   - As-built datasheets: drafting started for instrument data sheets. 40% complete.
   - Insulation on 12 inch P-1015 — heat tracing for freeze protection, not insulation per spec.
   - Spool marking and numbering in workshop — new batch of spools tagged for next project phase.

5. HSE
   - Emergency drill live: conducted 5 Sep. Evacuation time 4 min 20 sec. Improvement needed.
   - BBS observations: 26 this week. Trending up — good.
"""))

# --- DPR Day 10: 15 Sep 2026 ---
dprs.append(("2026-09-15", 10, [
    ("Pipe insulation 8 inch P-1003 complete", "PIP-INS-1047"),
    ("Paint coating pipe rack", "PIP-PAI-1048"),
    ("P&ID punch list close-out", "PIP-PCD-1053"),
    ("SWGR 6.6kV energisation", "ELE-ENG-1092"),
    ("MCC energised", "ELE-ENG-1093"),
    ("Motor start-up P-101A", "ELE-MTR-1094"),
    ("Motor start-up P-101B", "ELE-MTR-1094"),
    ("CS-01 motor start-up", "ELE-MTR-1095"),
    ("Area lighting complete", "ELE-LIG-1088"),
    ("Lighting circuit testing complete", "ELE-LIG-1089"),
    ("Loop check complete", "INS-LOOP-1107"),
    ("Control valve loop check complete", "INS-LOOP-1108"),
    ("DCS integration complete", "INS-ICS-1106"),
    ("SIS logic test", "INS-SFT-1109"),
    ("ESD functional test", "INS-SFT-1110"),
    ("As-built datasheets", "INS-DOC-1111"),
    ("Monthly safety report", "HSE-DSH-1121"),
    ("BBS observations", "HSE-BBS-1113"),
    ("JMR for August progress billing", "NO_MATCH"),
    ("earthing system continuity test", "ELE-GRD-1086"),
    ("weekly progress photo compilation", "NO_MATCH"),
], """DAILY PROGRESS REPORT
Date: 15/09/2026  |  Weather: Clear, 34C
Contractor: ABC Infra Pvt Ltd
Prepared by: Vikram Saikia

1. PIPING
   - Pipe insulation 8 inch P-1003: ALL 80 m2 complete.
   - Paint coating pipe rack: 720 of 850 m2 done. Should close by 18 Sep.
   - P&ID punch list close-out: 8 of 12 Category A items closed. 4 remaining — need vendor support for specialty valve issue. 20 of 28 Category B closed.

2. ELECTRICAL
   - SWGR 6.6kV energisation: STAGED APPROACH. First stage completed 10 Sep — bus energised, all interlocks verified. Second stage 12 Sep — transformer to SWGR confirmed. Third stage today — MCC energised from SWGR. All 6 MCC panels live.
   - Motor start-up P-101A: started and run for 4 hours. Vibration: 2.1 mm/s (within limit of 4.5). Current: 85% of FLA. All readings normal.
   - Motor start-up P-101B: started, run-in test ongoing. Same parameters as P-101A, looking good.
   - Area lighting: ALL 32 lights installed. 16 of 16 circuits tested and passed.
   - CS-01 motor start-up: compressor started 13 Sep. Run for 48 hours. Bearing temperatures stable. Vibration 3.2 mm/s within spec.
   - Earthing system continuity test: all grid resistance readings within 1 ohm spec.

3. INSTRUMENTATION
   - Loop check: ALL 62 loops completed and verified.
   - Control valve loop check: ALL 8 CVs verified from DCS.
   - DCS integration: COMPLETE. All signals live on DCS screens.
   - SIS logic test: SIL-2 functions tested. 4 SIFs all passed cause-effect verification.
   - ESD functional test: conducted 14 Sep. Full cause-and-effect matrix verified. ESD trip test on V-101 successful.
   - As-built instrument datasheets: 80% complete. Issuing by 20 Sep.

4. HSE
   - Monthly safety report compiled. Period: Aug-Sep. 0 LTI, 6 near-misses (all closed). BBS observations: 92 total over 8 weeks. Good upward trend.
   - JMR for August progress billing submitted to planning dept.
   - Weekly progress photo compilation prepared for client review meeting.
"""))

# Write DPR files and build ground truth from DPRs
gt_rows = []
for date, day_num, mentions, text in dprs:
    with open(f"dataset/dpr_day_{day_num:02d}.txt", "w", encoding="utf-8") as f:
        f.write(text)
    for mention, aid in mentions:
        gt_rows.append({
            "source": f"dpr_day_{day_num:02d}.txt",
            "source_date": date,
            "raw_mention": mention,
            "activity_id": aid,
            "match_type": "no_match" if aid == "NO_MATCH" else "exact"
        })

total_dpr = sum(len(d[2]) for d in dprs)
no_match_dpr = sum(1 for d in dprs for m in d[2] if m[1] == "NO_MATCH")
print(f"[B] 10 DPR files written — {total_dpr} mentions, {no_match_dpr} NO_MATCH")

# ══════════════════════════════════════════════════════════════════════════════
# C) DISCIPLINE SPREADSHEETS
# ══════════════════════════════════════════════════════════════════════════════

# ── piping_progress.xlsx ────────────────────────────────────────────────────
piping_rows = [
    ["PIP-1023","P-RACK-T1","—","Pipe Rack Steel Erection Tier 1","PIP","Main Rack","2026-07-13","25/07/2026",12,100,"Completed",""],
    ["PIP-1024","P-RACK-T2","—","Pipe Rack Steel Erection Tier 2","PIP","Main Rack","22/07/2026","02/08/2026",11,97,"In Progress","4 MT remaining, crane issue"],
    ["PIP-1025",'24"-P-1001-A1A',"—",'Spool Fab — 24" Main Header',"PIP","Workshop","15/Jul/2026","2026-08-05",21,100,"Complete","18 spools fabricated"],
    ["PIP-1026",'12"-P-1002-B1A',"—",'Spool Fab — 12" Transfer Line',"PIP","Workshop","18/Jul/2026","01/08/2026",14,100,"Complete","12 spools completed"],
    ["PIP-1027",'8"-P-1003-A1B',"—",'Spool Fab — 8" Flare Header',"PIP","Workshop","20/Jul/2026","2026-08-08",19,71,"In Progress","10 of 14 spools done"],
    ["PIP-1028",'4"-P-1010-C1A',"—",'Spool Fab — 4" Utility Water',"PIP","Workshop","25/Jul/2026","10/08/2026",16,100,"Complete","8 spools done"],
    ["PIP-1029",'6"-P-1015-A1A',"—",'Spool Fab — 6" Drain Header',"PIP","Workshop","28/Jul/2026","2026-08-12",15,20,"In Progress","2 of 10 spools done"],
    ["PIP-1030",'24"-P-1001-A1A',"TS-01 to TS-06",'Spool Erection — 24" Main Header',"PIP","Tier 1 Rack","01/08/2026","18/08/2026",17,100,"Complete","All 18 spools erected"],
    ["PIP-1031",'12"-P-1002-B1A',"TS-07 to TS-10",'Spool Erection — 12" Transfer',"PIP","Tier 1 Rack","02/08/2026","15/08/2026",13,100,"Complete","12 spools erected"],
    ["PIP-1032",'8"-P-1003-A1B',"TS-11 to TS-15",'Spool Erection — 8" Flare Header',"PIP","Tier 1/2","06/08/2026","22/08/2026",16,100,"Complete","14 spools erected"],
    ["PIP-1033",'4"-P-1010-C1A',"TS-16 to TS-18",'Spool Erection — 4" Utility Water',"PIP","Tier 1 Rack","11/08/2026","22/08/2026",11,100,"Complete","8 spools erected"],
    ["PIP-1034",'6"-P-1015-A1A',"TS-19 to TS-21",'Spool Erection — 6" Drain Header',"PIP","Tier 1 Rack","13/08/2026","25/08/2026",12,100,"Complete","10 spools erected"],
    ["PIP-1035",'24"-P-1001-A1A',"—",'Flange Mgmt — 24" Main Header',"PIP","Tier 1 Rack","2026-08-19","2026-08-26",7,100,"Complete","36 flanges bolted"],
    ["PIP-1036",'12"-P-1002-B1A',"—",'Flange Mgmt — 12" Transfer',"PIP","Tier 1 Rack","2026-08-16","22/08/2026",6,100,"Complete","24 flanges done"],
    ["PIP-1037",'8"-P-1003-A1B',"—",'Flange Mgmt — 8" Flare Header',"PIP","Tier 1/2","2026-08-23","30/08/2026",7,100,"Complete","28 flanges bolted"],
    ["PIP-1038",'4"-P-1010-C1A',"—",'Flange Mgmt — 4" Utility Water',"PIP","Tier 1 Rack","2026-08-23","28/08/2026",5,100,"Complete","16 flanges done"],
    ["PIP-1039",'6"-P-1015-A1A',"—",'Flange Mgmt — 6" Drain Header',"PIP","Tier 1 Rack","2026-08-26","02/09/2026",7,100,"Complete","20 flanges bolted"],
    ["PIP-1040",'24"-P-1001-A1A',"HT-01 to HT-06",'Hydrotest — 24" Main Header',"PIP","Tier 1 Rack","2026-08-27","03/09/2026",7,100,"Complete","All 6 sections passed"],
    ["PIP-1041",'12"-P-1002-B1A',"HT-07 to HT-10",'Hydrotest — 12" Transfer',"PIP","Tier 1 Rack","23/08/2026","28/08/2026",5,100,"Complete","4 sections passed"],
    ["PIP-1042",'8"-P-1003-A1B',"HT-11 to HT-15",'Hydrotest — 8" Flare Header',"PIP","Tier 1/2","2026-08-31","06/09/2026",6,100,"Complete","5 sections passed"],
    ["PIP-1043",'4"-P-1010-C1A',"HT-16 to HT-18",'Hydrotest — 4" Utility Water',"PIP","Tier 1 Rack","2026-08-29","03/09/2026",5,100,"Complete","3 sections passed"],
    ["PIP-1044",'6"-P-1015-A1A',"HT-19 to HT-21",'Hydrotest — 6" Drain Header',"PIP","Tier 1 Rack","2026-09-03","08/09/2026",5,100,"Complete","3 sections passed"],
    ["PIP-1045",'24"-P-1001-A1A',"—",'Insulation — 24" Main Header',"PIP","Tier 1 Rack","2026-09-04","14/09/2026",10,100,"Complete","120 m2 done"],
    ["PIP-1046",'12"-P-1002-B1A',"—",'Insulation — 12" Transfer',"PIP","Tier 1 Rack","2026-08-29","06/09/2026",8,100,"Complete","65 m2 done"],
    ["PIP-1047",'8"-P-1003-A1B',"—",'Insulation — 8" Flare Header',"PIP","Tier 1/2","2026-09-07","15/09/2026",8,62,"In Progress","50 of 80 m2 done"],
    ["PIP-1048","—","—","Paint Coating — Pipe Rack","PIP","Full Rack","2026-09-01","12/09/2026",11,85,"In Progress","720 of 850 m2, humidity delay"],
    ["PIP-1049","—","—","Pipe Support Install — Tier 1","PIP","Tier 1 Rack","2026-08-10","25/08/2026",15,100,"Complete","145 supports installed"],
    ["PIP-1050","—","—","Pipe Support Install — Tier 2","PIP","Tier 2 Rack","2026-08-15","28/08/2026",13,97,"In Progress","3 rejected for elevation"],
    ["PIP-1051","CS-01","—","Skid Piping — CS-01","PIP","CS-01 Skid","2026-08-05","20/08/2026",15,100,"Complete","6 spools fab + erect"],
    ["PIP-1053","—","—","P&ID Punch List Close-out","PIP","Site-wide","2026-09-15","22/09/2026",7,67,"In Progress","8/12 Cat A, 20/28 Cat B closed"],
]

wb = Workbook()
ws = wb.active
ws.title = "Piping Progress"
ws.merge_cells("A1:L1")
ws["A1"] = "OIL INDIA — DULIAJAN WELL-SITE DEVELOPMENT — PIPING PROGRESS REGISTER"
ws["A1"].font = Font(bold=True, size=14)
ws["A1"].alignment = Alignment(horizontal="center")
ws.merge_cells("A2:L2")
ws["A2"] = "Reporting Period: Aug-Sep 2026  |  Contractor: ABC Infra Pvt Ltd"
ws["A2"].alignment = Alignment(horizontal="center")
# Merged group headers
for rng, txt in [("A3:C3","Identification"),("D3:F3","Work Description"),("G3:I3","Schedule"),("J3:L3","Progress")]:
    ws.merge_cells(rng)
    c = ws[rng.split(":")[0]]
    c.value = txt; c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
sub = ["Line No.","Tag/Spool","Test Section","Activity Name","Discipline Code","Location","Start Date","End Date","Planned Duration (days)","% Done","Status","Remarks / JMR Ref"]
for i,h in enumerate(sub,1):
    c = ws.cell(row=4,column=i,value=h); c.font = Font(bold=True); c.fill = PatternFill(start_color="D9E2F3", end_color="D9E2F3", fill_type="solid"); c.alignment = Alignment(horizontal="center",wrap_text=True)
for ri,rd in enumerate(piping_rows,5):
    for ci,v in enumerate(rd,1):
        ws.cell(row=ri,column=ci,value=v)
sr = len(piping_rows)+6
ws.merge_cells(f"A{sr}:D{sr}")
ws.cell(row=sr,column=1,value="TOTAL PIPING DISCIPLINE").font = Font(bold=True)
ws.cell(row=sr,column=12,value=f"Overall: {sum(1 for r in piping_rows if r[10]=='Complete')}/{len(piping_rows)} activities complete")
for i,w in enumerate([14,18,14,35,12,15,14,14,16,8,12,30],1):
    ws.column_dimensions[get_column_letter(i)].width = w
wb.save("dataset/piping_progress.xlsx")

# Add spreadsheet rows to ground truth
for r in piping_rows:
    gt_rows.append({"source":"piping_progress.xlsx","source_date":"2026-09-15","raw_mention":f"{r[3]} — {r[11]}","activity_id":r[0],"match_type":"exact"})

# ── civil_progress.xlsx ─────────────────────────────────────────────────────
civil_rows = [
    ["CIV-SIT-1001","Site Clearing Zone A","Zone A","01/06/2026","07/06/2026","2026-06-07",1200,1200,"m2","Complete"],
    ["CIV-SIT-1002","Site Clearing Zone B","Zone B","03/Jun/2026","10/06/2026","10/06/2026",1200,1200,"m2","Complete"],
    ["CIV-SIT-1003","Grading & Compaction A+B","Zone A+B","11/06/2026","2026-06-17","2026-06-17",2400,2400,"m2","95% MDD achieved"],
    ["CIV-PLY-1004","Bored Piling — Pipe Rack P1-P12","Main Rack","18/Jun/2026","01/Jul/2026","02/Jul/2026",16,16,"nos","1 day over, piling rig breakdown"],
    ["CIV-PLY-1005","Bored Piling — Equip Fdn EF1-EF4","Equip Area","20/06/2026","05/Jul/2026","2026-07-05",24,24,"nos","Complete"],
    ["CIV-PLY-1006","Bored Piling — Tank TK-1","Tank Farm","25/Jun/2026","2026-07-12","13/07/2026",32,32,"nos","1 day over, rain delay"],
    ["CIV-FDN-1007","Pedestal Concreting P1-P12","Main Rack","02/Jul/2026","12/Jul/2026","2026-07-12",48,48,"m3","M30 concrete, cubes passed"],
    ["CIV-FDN-1008","Equip Foundation EF1-EF4","Equip Area","06/07/2026","2026-07-20","20/Jul/2026",120,120,"m3","M35 concrete, 7-day strength OK"],
    ["CIV-FDN-1009","Tank Ringwall Foundation TK-1","Tank Farm","13/Jul/2026","2026-07-25","2026-07-25",65,65,"m3","Complete"],
    ["CIV-FDN-1010","Slab-on-Grade Pump House","Pump House","14/Jul/2026","21/Jul/2026","21/07/2026",180,180,"m2","200 mm thk M30"],
    ["CIV-BKL-1011","Backfilling — Pipe Rack Trenches","Main Rack","22/Jul/2026","2026-07-28","28/Jul/2026",320,320,"m3","Compacted sand fill"],
    ["CIV-BKL-1012","Backfilling — Equipment Pads","Equip Area","2026-07-21","2026-07-28","2026-07-28",180,180,"m3","Approved backfill material"],
    ["CIV-BND-1013","Containment Bund Wall Zone A","Tank Farm","26/Jul/2026","2026-08-08","08/Aug/2026",85,85,"m3","Complete, 600mm thk RC"],
    ["CIV-GBM-1014","Grade Beams Pipe Rack","Main Rack","15/Jul/2026","2026-07-22","17/08/2026",42,42,"m3","Completed in 2 pours"],
    ["CIV-DWG-1015","Drainage Channels Perimeter","Plot Boundary","01/Aug/2026","2026-08-12","02/09/2026",160,160,"lm","Delayed by fencing conflict"],
    ["CIV-FNC-1016","Fence & Gate Plot Boundary","Plot Boundary","2026-08-10","18/08/2026","02/09/2026",480,480,"lm","Complete, 3 gates"],
    ["CIV-PLG-1017","Firewater Pit Zone B","Zone B","2026-08-05","2026-08-12","12/08/2026",45,45,"m3","Lined pit complete"],
    ["CIV-FND-1018","Foundation — Compressor Skid CS-01","Equip Area","08/Jul/2026","16/Jul/2026","2026-07-16",35,35,"m3","M35, curing complete"],
    ["CIV-FND-1019","Foundation — Header Skid HS-01","Equip Area","10/Jul/2026","2026-07-17","17/07/2026",28,28,"m3","M30, complete"],
    ["CIV-FLR-1020","Flooring — MCC Room","MCC Room","28/Jul/2026","03/Aug/2026","23/08/2026",95,95,"m2","Tiles done. Holiday delays"],
    ["CIV-PLT-1021","Plastering & Painting MCC Room","MCC Room","04/Aug/2026","10/Aug/2026","08/09/2026",220,220,"m2","2 coats plaster + distemper"],
    ["CIV-APN-1022","Cable Tray Buried A+B","Zone A+B","01/Aug/2026","10/Aug/2026","2026-09-02",280,280,"lm","Completed, backfilled"],
]

wb2 = Workbook()
ws2 = wb2.active
ws2.title = "Civil Works Progress"
ws2.merge_cells("A1:J1")
ws2["A1"] = "OIL INDIA LIMITED — DULIAJAN — CIVIL & STRUCTURAL PROGRESS TRACKER"
ws2["A1"].font = Font(bold=True, size=14)
ws2["A1"].alignment = Alignment(horizontal="center")
ws2.merge_cells("A2:J2")
ws2["A2"] = "Month: August 2026  |  Sub-Contractor: BuildRight Construction"
ws2["A2"].alignment = Alignment(horizontal="center")
cheaders = ["Task ID","Work Item","Zone / Location","Commenced","Target Completion","Actual / Est. Completion","Planned Qty","Achieved Qty","UoM","Remarks"]
for i,h in enumerate(cheaders,1):
    c = ws2.cell(row=3,column=i,value=h); c.font = Font(bold=True); c.fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid"); c.alignment = Alignment(horizontal="center",wrap_text=True)
for ri,rd in enumerate(civil_rows,4):
    for ci,v in enumerate(rd,1):
        ws2.cell(row=ri,column=ci,value=v)
sr2 = len(civil_rows)+5
ws2.merge_cells(f"A{sr2}:E{sr2}")
ws2.cell(row=sr2,column=1,value="DISCIPLINE TOTAL: CIVIL").font = Font(bold=True)
ws2.cell(row=sr2,column=10,value=f"{sum(1 for r in civil_rows if 'Complete' in r[9] or 'done' in r[9].lower())} of {len(civil_rows)} complete")
for i,w in enumerate([16,32,14,14,18,18,12,12,8,28],1):
    ws2.column_dimensions[get_column_letter(i)].width = w
wb2.save("dataset/civil_progress.xlsx")

# Add spreadsheet rows to ground truth
for r in civil_rows:
    gt_rows.append({"source":"civil_progress.xlsx","source_date":"2026-09-15","raw_mention":f"{r[1]} — {r[9]}","activity_id":r[0],"match_type":"exact"})

print("[C] piping_progress.xlsx and civil_progress.xlsx written")

# ══════════════════════════════════════════════════════════════════════════════
# D) GROUND TRUTH CSV
# ══════════════════════════════════════════════════════════════════════════════

with open("dataset/ground_truth.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["source","source_date","raw_mention","activity_id","match_type"])
    writer.writeheader()
    writer.writerows(gt_rows)

total = len(gt_rows)
nm = sum(1 for r in gt_rows if r["activity_id"] == "NO_MATCH")
print(f"\n[D] ground_truth.csv written — {total} rows")
print(f"    NO_MATCH: {nm} ({100*nm/total:.1f}%)")

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

print(f"\n{'='*60}")
print(f"DATASET GENERATION COMPLETE")
print(f"{'='*60}")
print(f"\nFiles in dataset/:")
for fn in sorted(os.listdir("dataset")):
    sz = os.path.getsize(f"dataset/{fn}")
    print(f"  {fn:30s} {sz:>8,} bytes")

print(f"\nActivity breakdown:")
from collections import Counter
disc_counts = Counter(a["discipline"] for a in activities)
for d, c in sorted(disc_counts.items()):
    print(f"  {d:20s} {c:3d} activities")

print(f"\nGround truth breakdown:")
src_counts = Counter(r["source"] for r in gt_rows)
for s, c in sorted(src_counts.items()):
    print(f"  {s:30s} {c:3d} mentions")
