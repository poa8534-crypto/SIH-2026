# -*- coding: utf-8 -*-
"""Generate a Primavera P6-style L5/L6 schedule extract (JSON) for the
Duliajan well-site development project, Oil India Limited (OIL), Assam.

Hand-authored activity network; dates are computed from durations and
predecessor relationships over 6-day / 7-day working calendars, then
validated (cycle-free, FS-feasible, bounded to Mar-2026..Mar-2027).
"""
import json
from datetime import date, timedelta

OUT = r"c:\Users\tcgxu\OneDrive\Desktop\SIH 2026\duliajan_p6_schedule.json"

L1 = "Duliajan Well-Site Development, Oil India Limited"
P1 = "Site Preparation and Civil Works"
P2 = "Foundations and Underground Services"
P3 = "Mechanical and Static Equipment Erection"
P4 = "Piping, Electrical and Instrumentation"
P5 = "Pre-commissioning, Testing and Handover"

ACTS = []

def A(id, disc, level, parent, phase, area, wp, desc, tag, dur, qty, uom, cal, preds, seed=None):
    ACTS.append(dict(id=id, disc=disc, level=level, parent=parent, phase=phase,
                     area=area, wp=wp, desc=desc, tag=tag, dur=dur, qty=qty,
                     uom=uom, cal=cal, preds=preds, seed=seed))

# ================= PHASE 1 : Site Preparation and Civil Works =================
AR = "Site Survey and Access"; WP = "Survey and Earthworks"
A("CIV-SRV-1001","civil",5,None,P1,AR,WP,"Topographic survey and grid establishment, well-site boundary",None,6,4800,"m2","6-day",[],"2026-03-02")
A("CIV-SRV-1002","civil",5,None,P1,AR,WP,"Clearing and grubbing, well pad and approach road",None,8,6200,"m2","6-day",[("CIV-SRV-1001","FS",1)])
A("CIV-EXC-1003","civil",5,None,P1,AR,WP,"Cut and fill to formation level, well pad Unit 1",None,10,2400,"m3","6-day",[("CIV-SRV-1002","FS",2)])
A("CIV-EXC-1004","civil",5,None,P1,AR,WP,"Cut and fill to formation level, well pad Unit 2",None,9,2100,"m3","6-day",[("CIV-SRV-1002","SS",3)])
A("CIV-EXC-1005","civil",6,"CIV-EXC-1003",P1,AR,WP,"Excavate unsuitable material, Unit 1 pad",None,3,850,"m3","6-day",[("CIV-EXC-1003","SS",0)])
A("CIV-FIL-1006","civil",6,"CIV-EXC-1003",P1,AR,WP,"Place and compact selected fill, Unit 1 pad",None,6,1900,"m3","6-day",[("CIV-EXC-1005","FS",1)])
A("CIV-FIL-1007","civil",6,"CIV-EXC-1003",P1,AR,WP,"Proof roll and level survey, Unit 1 pad formation",None,2,2400,"m2","6-day",[("CIV-FIL-1006","FF",0)])
A("CIV-YRD-1046","civil",5,None,P1,AR,WP,"Crusher fines laying, equipment laydown yard",None,5,1200,"m2","6-day",[("CIV-SRV-1002","FS",5)])
A("CIV-EXC-1049","civil",5,None,P1,AR,WP,"Approach road widening, OIL main gate to site (Ch 0-400)",None,9,400,"lm","6-day",[("CIV-SRV-1001","FS",3)])
A("CIV-RDS-1050","civil",5,None,P1,AR,WP,"BC course laying, approach road",None,5,400,"lm","6-day",[("CIV-EXC-1049","FS",2)])
A("CIV-DRA-1051","civil",5,None,P1,AR,WP,"Roadside drain slabs, approach road",None,6,380,"m","6-day",[("CIV-EXC-1049","SS",3)])
A("CIV-FNC-1052","civil",5,None,P1,AR,WP,"Fencing, approach road stretch",None,7,420,"m","6-day",[("CIV-FNC-1032","SS",20)])
A("CIV-DRA-1055","civil",5,None,P1,AR,WP,"Soil erosion protection jute matting, embankment slopes",None,4,310,"m2","6-day",[("CIV-EXC-1030","SS",4)])
AR = "Wellhead Area Unit 1"; WP = "Unit 1 Roads and Drainage"
A("CIV-RDS-1010","civil",5,None,P1,AR,WP,"Sub-grade preparation, internal access road Unit 1",None,7,320,"lm","6-day",[("CIV-EXC-1003","FS",2)])
A("CIV-RDS-1011","civil",5,None,P1,AR,WP,"Granular sub-base and WMM laying, internal road Unit 1",None,8,320,"lm","6-day",[("CIV-RDS-1010","FS",1)])
A("CIV-RDS-1012","civil",6,"CIV-RDS-1011",P1,AR,WP,"Lay and compact WMM course, road U1 Ch 0-160",None,4,160,"lm","6-day",[("CIV-RDS-1011","SS",1)])
A("CIV-RDS-1013","civil",6,"CIV-RDS-1011",P1,AR,WP,"Lay and compact WMM course, road U1 Ch 160-320",None,4,160,"lm","6-day",[("CIV-RDS-1012","FS",0)])
A("CIV-DRA-1014","civil",5,None,P1,AR,WP,"Precast drain construction, Unit 1 wellhead periphery",None,9,260,"m","6-day",[("CIV-RDS-1010","SS",2)])
A("CIV-DRA-1015","civil",5,None,P1,AR,WP,"Culvert placement at road crossing, Unit 1 approach",None,3,2,"nos","6-day",[("CIV-RDS-1012","FF",1)])

AR = "Wellhead Area Unit 2"; WP = "Unit 2 Earthworks"
A("CIV-EXC-1020","civil",5,None,P1,AR,WP,"Bulk excavation, Unit 2 wellhead cellar",None,8,1600,"m3","6-day",[("CIV-EXC-1004","FS",1)])
A("CIV-FLR-1021","civil",5,None,P1,AR,WP,"Anti-termite treatment and PCC blinding, Unit 2 pad",None,4,950,"m2","6-day",[("CIV-EXC-1020","FS",1)])
A("CIV-FLR-1022","civil",5,None,P1,AR,WP,"Geotextile separation layer, Unit 2 pad",None,2,950,"m2","6-day",[("CIV-FLR-1021","SS",1)])

AR = "Manifold and Flare Area"; WP = "Flare Zone Earthworks"
A("CIV-EXC-1030","civil",5,None,P1,AR,WP,"Excavation for flare pit and burn area, manifold south",None,6,720,"m3","6-day",[("CIV-SRV-1002","FS",4)])
A("CIV-EXC-1031","civil",5,None,P1,AR,WP,"Rock breaking and muck disposal, flare stack base FST-1301",None,5,140,"m3","6-day",[("CIV-EXC-1030","FS",1)])
A("CIV-FNC-1032","civil",5,None,P1,AR,WP,"Chain-link fencing with posts, site perimeter",None,14,850,"m","6-day",[("CIV-SRV-1001","FS",21)])
A("CIV-FNC-1033","civil",5,None,P1,AR,WP,"Gate installation, main and emergency exits",None,3,3,"nos","6-day",[("CIV-FNC-1032","FS",1)])

AR = "General Facilities"; WP = "Temporary Facilities"
A("HSE-TMP-1040","hse",5,None,P1,AR,WP,"Erection of temporary site office and stores",None,6,180,"m2","6-day",[("CIV-SRV-1002","SS",1)])
A("HSE-TMP-1041","hse",5,None,P1,AR,WP,"Install temporary water supply and septic facility",None,4,1,"nos","6-day",[("HSE-TMP-1040","FS",2)])
A("HSE-TMP-1042","hse",5,None,P1,AR,WP,"Temporary power distribution boards and cabling",None,3,1,"nos","6-day",[("HSE-TMP-1040","FS",3)])
A("HSE-SGN-1043","hse",5,None,P1,AR,WP,"Safety signage and barricading, phase 1 work fronts",None,2,60,"nos","6-day",[("HSE-TMP-1040","FS",2)])
A("HSE-SGN-1044","hse",5,None,P1,AR,WP,"Establish emergency muster points and wind socks",None,2,4,"nos","6-day",[("HSE-TMP-1041","FS",1)])
A("HSE-TMP-1053","hse",5,None,P1,AR,WP,"Fabrication shed and pipe yard establishment",None,5,640,"m2","6-day",[("HSE-TMP-1040","SS",2)])
A("CIV-YRD-1054","civil",5,None,P1,AR,WP,"Bench marking and centre-line offsets, all areas",None,3,0,"","6-day",[("CIV-SRV-1001","FS",2)])
# ================= PHASE 2 : Foundations and Underground Services =================
AR = "Wellhead Area Unit 1"; WP = "Unit 1 Equipment Foundations"
A("CIV-EXC-1100","civil",5,None,P2,AR,WP,"Excavation for foundations V-1101/V-1201 and plinths WHP-1101/WHP-1102",None,6,640,"m3","6-day",[("CIV-EXC-1003","FS",1),("CIV-RDS-1010","FF",0)])
A("CIV-FDN-1101","civil",5,None,P2,AR,WP,"PCC blinding course, V-1101/V-1201 foundations, Unit 1",None,3,210,"m2","6-day",[("CIV-EXC-1100","FS",1)])
A("CIV-FDN-1102","civil",5,None,P2,AR,WP,"Reinforcement fabrication and placement, separator foundation V-1101","V-1101",5,12.5,"mt","6-day",[("CIV-FDN-1101","FS",1)])
A("CIV-FDN-1103","civil",5,None,P2,AR,WP,"Shuttering and concreting M25, separator foundation V-1101","V-1101",4,48,"m3","6-day",[("CIV-FDN-1102","FS",1)])
A("CIV-FDN-1104","civil",6,"CIV-FDN-1103",P2,AR,WP,"7-day wet cure, separator foundation V-1101","V-1101",7,0,"","6-day",[("CIV-FDN-1103","FF",0)])
A("CIV-FDN-1105","civil",5,None,P2,AR,WP,"Anchor bolt setting, separator skid V-1101","V-1101",2,12,"nos","6-day",[("CIV-FDN-1104","FS",0)])
A("CIV-FDN-1106","civil",5,None,P2,AR,WP,"Non-shrink grouting, separator skid base ring V-1101","V-1101",2,1.2,"m3","6-day",[("CIV-FDN-1105","FS",1)])
A("CIV-FDN-1107","civil",5,None,P2,AR,WP,"Reinforcement and concreting, glycol contactor foundation V-1201","V-1201",7,55,"m3","6-day",[("CIV-FDN-1101","SS",2)])
A("CIV-FDN-1108","civil",6,"CIV-FDN-1107",P2,AR,WP,"Anchor bolt template survey and setting, V-1201","V-1201",2,16,"nos","6-day",[("CIV-FDN-1107","SS",4)])
A("CIV-FDN-1109","civil",6,"CIV-FDN-1107",P2,AR,WP,"Grouting, V-1201 base ring","V-1201",1,0.8,"m3","6-day",[("CIV-FDN-1107","FF",7)])
A("CIV-FDN-1110","civil",5,None,P2,AR,WP,"Wellhead plinth concreting, WHP-1101 and WHP-1102",None,6,36,"m3","6-day",[("CIV-FDN-1101","FS",2)])
A("CIV-FDN-1111","civil",5,None,P2,AR,WP,"Kerbing around wellhead cellars, Unit 1",None,3,90,"m","6-day",[("CIV-FDN-1110","FS",2)])

AR = "Wellhead Area Unit 2"; WP = "Unit 2 Equipment Foundations"
A("CIV-EXC-1115","civil",5,None,P2,AR,WP,"Excavation for foundations V-2101 and WHCP-2101, Unit 2",None,6,580,"m3","6-day",[("CIV-FLR-1021","FS",1)])
A("CIV-FDN-1116","civil",5,None,P2,AR,WP,"Foundation for wellhead control panel WHCP-2101, Unit 2","WHCP-2101",4,14,"m3","6-day",[("CIV-EXC-1115","FS",1)])
A("CIV-FDN-1117","civil",5,None,P2,AR,WP,"Separator foundation, reinforcement and pour, V-2101","V-2101",6,52,"m3","6-day",[("CIV-EXC-1115","FS",2)])
A("CIV-FDN-1118","civil",6,"CIV-FDN-1117",P2,AR,WP,"7-day wet cure, V-2101 foundation","V-2101",7,0,"","6-day",[("CIV-FDN-1117","FF",0)])
A("CIV-FDN-1119","civil",5,None,P2,AR,WP,"Grouting, V-2101 skid","V-2101",1,1.0,"m3","6-day",[("CIV-FDN-1118","FS",1)])
A("CIV-FDN-1120","civil",5,None,P2,AR,WP,"Test separator plinth V-2201, Unit 2","V-2201",4,18,"m3","6-day",[("CIV-FDN-1116","FS",2)])

AR = "Manifold and Flare Area"; WP = "Manifold Foundations"
A("CIV-FDN-1125","civil",5,None,P2,AR,WP,"Isolated foundations, manifold block valves MV-1101 to MV-1108",None,8,42,"m3","6-day",[("CIV-EXC-1031","FS",3)])
A("CIV-FDN-1126","civil",5,None,P2,AR,WP,"Flare stack foundation and guy anchor blocks, FST-1301",None,6,38,"m3","6-day",[("CIV-EXC-1031","FS",2)])
A("CIV-FDN-1127","civil",5,None,P2,AR,WP,"Anchor bolts and template, flare stack FST-1301","FST-1301",2,20,"nos","6-day",[("CIV-FDN-1126","SS",4)])
AR = "Tank Farm Area"; WP = "Tank Farm Civil"
A("CIV-FDN-1150","civil",5,None,P2,AR,WP,"Ring wall foundation, storage tank TK-2101","TK-2101",9,120,"m3","6-day",[("CIV-EXC-1003","FS",12)])
A("CIV-FDN-1151","civil",5,None,P2,AR,WP,"Annular plate leveling and grout bed, TK-2101","TK-2101",3,62,"m","6-day",[("CIV-FDN-1150","FF",0)])
A("CIV-FDN-1152","civil",5,None,P2,AR,WP,"Ring wall foundation, storage tank TK-2102","TK-2102",8,110,"m3","6-day",[("CIV-FDN-1150","SS",4)])
A("CIV-FDN-1153","civil",5,None,P2,AR,WP,"Oil-water separator pit civil works, OWS-2201","OWS-2201",6,28,"m3","6-day",[("CIV-DRA-1014","SS",6)])
A("CIV-FDN-1154","civil",5,None,P2,AR,WP,"Dyke wall construction, tank farm bund",None,10,210,"m3","6-day",[("CIV-FDN-1150","SS",6)])

AR = "Tank Farm Area"; WP = "Underground Services - Tank Farm"
A("PIP-UGS-1155","piping",5,None,P2,AR,WP,"Oily water sewer line 6\"-P-2103-C5B, tank farm to OWS-2201","6\"-P-2103-C5B",6,130,"m","6-day",[("CIV-FDN-1153","FF",1)])
A("PIP-UGS-1156","piping",5,None,P2,AR,WP,"Chamber and catch pit construction, OWS outfall",None,4,3,"nos","6-day",[("CIV-FDN-1153","FS",1)])

AR = "Substation Area"; WP = "Substation Civil"
A("CIV-FDN-1160","civil",5,None,P2,AR,WP,"Control building foundation and plinth, substation",None,10,95,"m3","6-day",[("CIV-DRA-1015","FF",15)])
A("CIV-BLD-1161","civil",5,None,P2,AR,WP,"Control building blockwork and roofing",None,12,145,"m2","6-day",[("CIV-FDN-1160","FS",2)])
A("CIV-FDN-1162","civil",5,None,P2,AR,WP,"Transformer plinths and cable trenches, T-1 and T-2",None,6,24,"m3","6-day",[("CIV-FDN-1160","SS",5)])

AR = "Main Pipe Rack"; WP = "Pipe Rack Foundations"
A("CIV-FDN-1165","civil",5,None,P2,AR,WP,"Sleeper and column footings, pipe rack Module 1",None,5,90,"m3","6-day",[("CIV-EXC-1003","FS",18)])
A("CIV-FDN-1166","civil",5,None,P2,AR,WP,"Sleeper and column footings, pipe rack Module 2",None,5,85,"m3","6-day",[("CIV-FDN-1165","FS",2)])
A("CIV-FDN-1167","civil",5,None,P2,AR,WP,"Sleeper and column footings, pipe rack Module 3",None,4,68,"m3","6-day",[("CIV-FDN-1166","FS",1)])

AR = "Wellhead Area Unit 1"; WP = "Underground Firewater"
A("PIP-UGS-1170","piping",5,None,P2,AR,WP,"Trenching for firewater ring main 10\"-P-1602-B1A, Unit 1 and manifold","10\"-P-1602-B1A",10,480,"m","6-day",[("CIV-RDS-1010","SS",3)])
A("PIP-UGS-1171","piping",5,None,P2,AR,WP,"Lay and joint GRP firewater main 10\"-P-1602-B1A","10\"-P-1602-B1A",9,480,"m","6-day",[("PIP-UGS-1170","SS",2)])
A("PIP-UGS-1172","piping",6,"PIP-UGS-1171",P2,AR,WP,"Hydrotest firewater main 10\"-P-1602-B1A, Manifold to Unit 1 section","10\"-P-1602-B1A",2,240,"m","6-day",[("PIP-UGS-1171","SS",5)])
A("PIP-UGS-1173","piping",6,"PIP-UGS-1171",P2,AR,WP,"Hydrotest firewater main 10\"-P-1602-B1A, Unit 1 to Unit 2 section","10\"-P-1602-B1A",2,240,"m","6-day",[("PIP-UGS-1172","FS",0)])
A("PIP-UGS-1174","piping",5,None,P2,AR,WP,"Backfill and compaction, firewater trench 10\"-P-1602-B1A","10\"-P-1602-B1A",5,480,"m","6-day",[("PIP-UGS-1173","FF",0)])
A("PIP-UGS-1175","piping",5,None,P2,AR,WP,"Firewater hydrant and monitor bases, ring main 10\"-P-1602-B1A","10\"-P-1602-B1A",4,8,"nos","6-day",[("PIP-UGS-1171","SS",6)])

AR = "Substation Area"; WP = "Cable Trenches"
A("CIV-UGS-1180","civil",5,None,P2,AR,WP,"Cable trench with precast covers, Unit 1 to substation",None,8,210,"m","6-day",[("CIV-FDN-1162","FF",1)])
A("CIV-UGS-1181","civil",5,None,P2,AR,WP,"Cable trench with precast covers, Unit 2 to substation",None,7,190,"m","6-day",[("CIV-UGS-1180","SS",3)])
A("CIV-UGS-1182","civil",5,None,P2,AR,WP,"Trench sand bedding and protection tiles, cable routes",None,4,400,"m","6-day",[("CIV-UGS-1181","SS",2)])
# ================= PHASE 3 : Mechanical and Static Equipment Erection =================
AR = "Wellhead Area Unit 1"; WP = "Unit 1 Static Equipment"
A("STA-SET-1200","static_equipment",5,None,P3,AR,WP,"Receive and stage separator V-1101, transport from laydown","V-1101",2,1,"nos","6-day",[("CIV-FDN-1106","FS",20)])
A("STA-SET-1201","static_equipment",5,None,P3,AR,WP,"Rig and set vertical separator V-1101 on foundation","V-1101",3,1,"nos","6-day",[("STA-SET-1200","FS",0),("CIV-FDN-1106","FF",0)])
A("STA-SET-1202","static_equipment",5,None,P3,AR,WP,"Plumb, alignment and bolt torque, V-1101","V-1101",1,1,"nos","6-day",[("STA-SET-1201","FF",0)])
A("STA-SET-1203","static_equipment",5,None,P3,AR,WP,"Rig and set glycol contactor V-1201","V-1201",3,1,"nos","6-day",[("STA-SET-1202","FF",1),("CIV-FDN-1109","FF",0)])
A("STA-SET-1204","static_equipment",5,None,P3,AR,WP,"Set production manifold header assemblies, Unit 1, 16\"-P-1002-A1A tie-ins",None,5,38,"mt","6-day",[("CIV-FDN-1110","FS",4)])
A("STA-WLD-1205","static_equipment",6,"STA-SET-1204",P3,AR,WP,"Field welds, Unit 1 manifold spools, welds 1-12",None,3,12,"nos","6-day",[("STA-SET-1204","SS",3)])
A("STA-SET-1206","static_equipment",5,None,P3,AR,WP,"Install wellhead flowline risers, WHP-1101 and WHP-1102",None,4,2,"nos","6-day",[("STA-SET-1204","SS",2)])
A("STA-SET-1207","static_equipment",5,None,P3,AR,WP,"Set fuel gas skid, utilities plinth U1",None,2,1,"nos","6-day",[("CIV-FDN-1110","FS",45)])

AR = "Wellhead Area Unit 2"; WP = "Unit 2 Static Equipment"
A("STA-SET-1210","static_equipment",5,None,P3,AR,WP,"Rig and set separator V-2101","V-2101",3,1,"nos","6-day",[("CIV-FDN-1119","FS",2)])
A("STA-SET-1211","static_equipment",5,None,P3,AR,WP,"Set test separator V-2201, Unit 2","V-2201",2,1,"nos","6-day",[("CIV-FDN-1120","FS",2)])
A("STA-SET-1212","static_equipment",5,None,P3,AR,WP,"Set wellhead control panel skid WHCP-2101, Unit 2","WHCP-2101",2,1,"nos","6-day",[("CIV-FDN-1116","FF",3)])
A("STA-INT-1213","static_equipment",5,None,P3,AR,WP,"Load and fit internals and demisters, V-2101","V-2101",3,1,"nos","6-day",[("STA-SET-1210","FS",2)])
A("STA-INT-1214","static_equipment",5,None,P3,AR,WP,"Fit internals and demisters, V-2201","V-2201",2,1,"nos","6-day",[("STA-SET-1211","FS",1)])

AR = "Utilities Area"; WP = "Utilities Equipment"
A("STA-SET-1215","static_equipment",5,None,P3,AR,WP,"Set air receiver V-2301, utilities area","V-2301",2,1,"nos","6-day",[("CIV-FDN-1167","FS",3)])
A("STA-MCH-1216","static_equipment",5,None,P3,AR,WP,"Set instrument air compressors, package PK-2401","PK-2401",3,1,"nos","6-day",[("STA-SET-1215","FF",1)])
A("STA-MCH-1217","static_equipment",5,None,P3,AR,WP,"Alignment check and coupling, compressor PK-2401 to receiver","PK-2401",2,1,"nos","6-day",[("STA-MCH-1216","FS",1)])

AR = "Manifold and Flare Area"; WP = "Flare System Erection"
A("STA-FLR-1220","static_equipment",5,None,P3,AR,WP,"Shop assemble flare stack sections, FST-1301","FST-1301",6,22,"mt","6-day",[("CIV-FDN-1127","FS",10)])
A("STA-FLR-1221","static_equipment",5,None,P3,AR,WP,"Erect flare stack FST-1301, guys tensioned","FST-1301",3,1,"nos","6-day",[("STA-FLR-1220","FS",1),("CIV-FDN-1126","FF",0)])
A("STA-FLR-1222","static_equipment",5,None,P3,AR,WP,"Set flare knockout drum V-1401","V-1401",2,1,"nos","6-day",[("CIV-FDN-1125","FS",6)])
A("STA-FLR-1223","static_equipment",5,None,P3,AR,WP,"Install flare tip and molecular seal, FST-1301","FST-1301",2,1,"nos","6-day",[("STA-FLR-1221","FF",1)])
A("STA-FLR-1224","static_equipment",5,None,P3,AR,WP,"Install flare tip ignition panel and pilot lines","FST-1301",2,1,"nos","6-day",[("STA-FLR-1223","SS",1)])
AR = "Tank Farm Area"; WP = "Tank Erection"
A("STA-TNK-1230","static_equipment",5,None,P3,AR,WP,"Tank shell erection, courses 1-3, TK-2101","TK-2101",12,46,"mt","7-day",[("CIV-FDN-1151","FS",30)])
A("STA-TNK-1231","static_equipment",6,"STA-TNK-1230",P3,AR,WP,"Shell courses 1-2, tank TK-2101","TK-2101",7,30,"mt","7-day",[("STA-TNK-1230","SS",0)])
A("STA-TNK-1232","static_equipment",6,"STA-TNK-1230",P3,AR,WP,"Shell course 3 and wind girder, TK-2101","TK-2101",5,16,"mt","7-day",[("STA-TNK-1231","FF",0)])
A("STA-TNK-1233","static_equipment",5,None,P3,AR,WP,"Tank roof structure and fittings, TK-2101","TK-2101",8,14,"mt","7-day",[("STA-TNK-1232","FF",1)])
A("STA-TNK-1234","static_equipment",5,None,P3,AR,WP,"Tank shell erection and roof, TK-2102","TK-2102",14,55,"mt","7-day",[("CIV-FDN-1152","FS",6)])
A("STA-TNK-1235","static_equipment",5,None,P3,AR,WP,"Internal floating roof assembly, TK-2102","TK-2102",5,9,"mt","7-day",[("STA-TNK-1234","FF",2)])
A("STA-TNK-1236","static_equipment",5,None,P3,AR,WP,"Tank nozzles and manways fitting, TK-2101 and TK-2102",None,3,18,"nos","7-day",[("STA-TNK-1233","SS",4)])

AR = "Tank Farm Area"; WP = "Rotating Equipment"
A("STA-MCH-1240","static_equipment",5,None,P3,AR,WP,"Set crude transfer pumps P-1401A and P-1401B","P-1401A",4,2,"nos","6-day",[("CIV-FDN-1151","FS",30)])
A("STA-MCH-1241","static_equipment",5,None,P3,AR,WP,"Alignment check, P-1401A/B couplings","P-1401A",2,2,"nos","6-day",[("STA-MCH-1240","FF",0)])
A("STA-MCH-1242","static_equipment",5,None,P3,AR,WP,"Motor mounting and bolt torque, P-1401A/B","P-1401A",2,2,"nos","6-day",[("STA-MCH-1241","FF",0)])
A("STA-SET-1243","static_equipment",5,None,P3,AR,WP,"Set chemical injection skids CS-2501 and CS-2502, wellhead U1/U2","CS-2501",3,2,"nos","6-day",[("CIV-FDN-1110","FS",60)])
A("STA-SET-1244","static_equipment",5,None,P3,AR,WP,"Monorail and davit erection, separator platforms",None,3,1,"nos","6-day",[("STA-SET-1202","FF",2)])
# ================= PHASE 4 : Piping, Electrical and Instrumentation =================
AR = "Main Pipe Rack"; WP = "Pipe Rack Steel"
A("PIP-ERC-1300","piping",5,None,P4,AR,WP,"Erect multi-tier rack steel, Module 1 (Ch 0-40)",None,6,34,"mt","6-day",[("CIV-FDN-1165","FF",45)])
A("PIP-ERC-1301","piping",5,None,P4,AR,WP,"Erect rack steel, Module 2 (Ch 40-80)",None,6,33,"mt","6-day",[("CIV-FDN-1166","FF",45),("PIP-ERC-1300","SS",2)])
A("PIP-ERC-1302","piping",5,None,P4,AR,WP,"Erect rack steel, Module 3 (Ch 80-110)",None,5,25,"mt","6-day",[("CIV-FDN-1167","FF",45),("PIP-ERC-1301","SS",2)])
A("PIP-ERC-1303","piping",5,None,P4,AR,WP,"Rack cross bracing and kicker supports, full run",None,4,14,"nos","6-day",[("PIP-ERC-1302","FF",0)])
A("PIP-ERC-1304","piping",5,None,P4,AR,WP,"Pipe rack erection, crude header, Unit 2 to tank farm",None,5,36,"m","6-day",[("PIP-ERC-1301","SS",3)])
A("PIP-ERC-1305","piping",5,None,P4,AR,WP,"Rack erection, Module 3 tier 1, flare header 18\"-P-1301-B7A and utility lines",None,4,29,"m","6-day",[("PIP-ERC-1302","SS",2)])

AR = "Main Pipe Rack"; WP = "Crude Header Piping"
A("PIP-FAB-1310","piping",5,None,P4,AR,WP,"Shop fabrication, 24\"-P-1001-A1A spools","24\"-P-1001-A1A",8,78,"m","6-day",[],"2026-10-05")
A("PIP-ERC-1311","piping",5,None,P4,AR,WP,"Erect Line 24\"-P-1001-A1A, Unit 2 rack","24\"-P-1001-A1A",6,42,"m","6-day",[("PIP-FAB-1310","FS",2),("PIP-ERC-1303","FF",5)])
A("PIP-ERC-1312","piping",5,None,P4,AR,WP,"Erect crude header 24\"-P-1001-A1A, tank farm approach","24\"-P-1001-A1A",5,36,"m","6-day",[("PIP-ERC-1311","FS",8)])
A("PIP-WLD-1313","piping",5,None,P4,AR,WP,"Field weld and NDT, crude header rack welds 1-18",None,4,18,"nos","6-day",[("PIP-ERC-1312","FF",0)])
A("PIP-HLT-1314","piping",5,None,P4,AR,WP,"Support fabrication and installation, line 24\"-P-1001-A1A","24\"-P-1001-A1A",4,22,"nos","6-day",[("PIP-ERC-1311","SS",2)])
A("PIP-ERC-1315","piping",5,None,P4,AR,WP,"Erect line 16\"-P-1002-A1A, gas service, Unit 1 manifold","16\"-P-1002-A1A",5,54,"m","6-day",[("PIP-WLD-1313","FF",15),("STA-SET-1204","FF",30)])
A("PIP-ERC-1316","piping",5,None,P4,AR,WP,"Erect line 12\"-P-1003-A5A, test separator loop","12\"-P-1003-A5A",4,38,"m","6-day",[("PIP-FAB-1320","SS",20),("STA-INT-1214","FF",60)])
A("PIP-ERC-1317","piping",5,None,P4,AR,WP,"Erect line 8\"-P-1004-A6A, glycol feed to contactor V-1201","8\"-P-1004-A6A",3,26,"m","6-day",[("STA-SET-1203","FF",90)])
A("PIP-ERC-1318","piping",5,None,P4,AR,WP,"Erect line 6\"-P-1005-A6A, fuel gas skid inlet","6\"-P-1005-A6A",3,18,"m","6-day",[("STA-SET-1207","FF",60)])
A("PIP-INS-1319","piping",5,None,P4,AR,WP,"Install restriction orifice spools and sampling connections, Unit 1",None,2,6,"nos","6-day",[("PIP-ERC-1315","SS",3)])
AR = "Wellhead Area Unit 2"; WP = "Unit 2 Process Piping"
A("PIP-FAB-1320","piping",5,None,P4,AR,WP,"Shop fabrication, Unit 2 flowline manifolds",None,7,64,"m","6-day",[],"2026-10-01")
A("PIP-ERC-1321","piping",5,None,P4,AR,WP,"Erect line 20\"-P-2001-A1A, Unit 2 production header","20\"-P-2001-A1A",6,48,"m","6-day",[("PIP-FAB-1320","FS",15),("STA-INT-1213","FF",1)])
A("PIP-ERC-1322","piping",5,None,P4,AR,WP,"Erect line 10\"-P-2002-A5A, test header Unit 2","10\"-P-2002-A5A",4,31,"m","6-day",[("PIP-FAB-1320","SS",25),("STA-INT-1214","FF",0)])
A("PIP-WLD-1323","piping",5,None,P4,AR,WP,"Field weld and RT, Unit 2 header welds 19-34",None,3,16,"nos","6-day",[("PIP-ERC-1321","FF",0),("PIP-ERC-1322","FF",0)])
A("PIP-BLT-1324","piping",5,None,P4,AR,WP,"Bolt torque and gasket joint assembly, Unit 2 manifold",None,3,48,"nos","6-day",[("PIP-WLD-1323","FF",0)])
A("PIP-HLT-1325","piping",5,None,P4,AR,WP,"Pipe supports and guides, Unit 2 rack stretch","20\"-P-2001-A1A",4,19,"nos","6-day",[("PIP-ERC-1321","SS",2)])

AR = "Manifold and Flare Area"; WP = "Flare and Relief Piping"
A("PIP-ERC-1330","piping",5,None,P4,AR,WP,"Erect flare header 18\"-P-1301-B7A, manifold to KO drum","18\"-P-1301-B7A",7,86,"m","6-day",[("STA-FLR-1222","FF",45),("PIP-ERC-1303","SS",60)])
A("PIP-ERC-1331","piping",5,None,P4,AR,WP,"Erect flare header riser, FST-1301 to tip","FST-1301",3,24,"m","6-day",[("STA-FLR-1221","FF",2)])
A("PIP-WLD-1332","piping",5,None,P4,AR,WP,"Alloy weld and PMI, flare header, welds 20-31",None,3,12,"nos","6-day",[("PIP-ERC-1330","FF",0)])
A("PIP-ERC-1333","piping",5,None,P4,AR,WP,"Erect blowdown lines 6\"-P-1302-A6A, wellhead SDVs","6\"-P-1302-A6A",4,44,"m","6-day",[("STA-SET-1206","FF",1),("PIP-ERC-1330","SS",3)])
A("PIP-ERC-1334","piping",5,None,P4,AR,WP,"Erect drain header 4\"-P-1303-C5B, closed drain","4\"-P-1303-C5B",3,36,"m","6-day",[("PIP-ERC-1330","SS",4)])

AR = "Tank Farm Area"; WP = "Tank Farm Piping"
A("PIP-ERC-1340","piping",5,None,P4,AR,WP,"Tank farm manifold 12\"-P-2101-A1A, inlet/outlet TK-2101","12\"-P-2101-A1A",5,44,"m","6-day",[("STA-TNK-1233","FF",90)])
A("PIP-ERC-1341","piping",5,None,P4,AR,WP,"Suction and discharge piping, pumps P-1401A/B to manifold","P-1401A",6,58,"m","6-day",[("STA-MCH-1242","FF",90)])
A("PIP-ERC-1342","piping",5,None,P4,AR,WP,"Erect 12\"-P-2102-A1A, TK-2102 manifold tie-in","12\"-P-2102-A1A",4,33,"m","6-day",[("PIP-ERC-1340","SS",3)])
A("PIP-ERC-1343","piping",5,None,P4,AR,WP,"Install tank dewatering lines 3\"-P-2104-C5B","3\"-P-2104-C5B",3,22,"m","6-day",[("STA-TNK-1236","FF",1)])
A("PIP-WLD-1344","piping",5,None,P4,AR,WP,"Field welds and UT, tank farm manifold, welds 40-52","12\"-P-2101-A1A",3,13,"nos","6-day",[("PIP-ERC-1341","FF",0),("PIP-ERC-1342","FF",0)])

AR = "Utilities Area"; WP = "Utilities Piping"
A("PIP-ERC-1350","piping",5,None,P4,AR,WP,"Instrument air header 2\"-P-2301-A6A, rack to Unit 2","2\"-P-2301-A6A",4,95,"m","6-day",[("STA-MCH-1217","FF",30),("PIP-ERC-1302","SS",30)])
A("PIP-ERC-1351","piping",5,None,P4,AR,WP,"Nitrogen line 3\"-P-2302-A6A, package to header","3\"-P-2302-A6A",3,40,"m","6-day",[("PIP-ERC-1350","SS",2)])
A("PIP-ERC-1352","piping",5,None,P4,AR,WP,"Firewater underground tie-ins and hydrant branches, ring main 10\"-P-1602-B1A","10\"-P-1602-B1A",5,9,"nos","6-day",[("PIP-UGS-1175","FF",2)])
A("PIP-ERC-1353","piping",5,None,P4,AR,WP,"Potable water line 2\"-P-2303-C5B, control building","2\"-P-2303-C5B",3,65,"m","6-day",[("CIV-UGS-1180","FF",2)])
A("PIP-ERC-1354","piping",5,None,P4,AR,WP,"Chemical injection piping 1\"-P-2501-A6A, skids to injection points","1\"-P-2501-A6A",3,34,"m","6-day",[("STA-SET-1243","FF",2)])
AR = "Main Pipe Rack"; WP = "Electrical Containment"
A("EL-TRK-1360","electrical",5,None,P4,AR,WP,"Install cable tray ladder 600 mm, rack tier 3",None,6,210,"m","6-day",[("PIP-ERC-1303","FF",1)])
A("EL-TRK-1361","electrical",5,None,P4,AR,WP,"Install cable tray 450 mm, rack tier 3, Unit 2 stretch",None,4,140,"m","6-day",[("EL-TRK-1360","SS",2)])
A("EL-TRK-1362","electrical",5,None,P4,AR,WP,"Install conduits and flexible connections, Unit 1/2 equipment",None,4,38,"nos","6-day",[("PIP-HLT-1325","SS",3)])
A("INS-TRK-1363","instrumentation",5,None,P4,AR,WP,"Install instrument cable tray 300 mm, rack tier 2",None,5,180,"m","6-day",[("PIP-ERC-1303","FF",5)])

AR = "Substation Area"; WP = "Electrical Distribution"
A("EL-TRK-1370","electrical",5,None,P4,AR,WP,"Install cable tray and risers, substation building",None,5,120,"m","6-day",[("CIV-UGS-1182","FF",10)])
A("EL-TRF-1371","electrical",5,None,P4,AR,WP,"Set and terminate transformer T-1, 11/0.433 kV","T-1",3,1,"nos","6-day",[("CIV-FDN-1162","FF",75)])
A("EL-TRF-1372","electrical",5,None,P4,AR,WP,"Set and terminate transformer T-2, 11/0.433 kV","T-2",3,1,"nos","6-day",[("EL-TRF-1371","FF",1)])
A("EL-SWB-1373","electrical",5,None,P4,AR,WP,"Install MCC panels and switchboard, substation room",None,6,6,"nos","6-day",[("CIV-BLD-1161","FF",40)])
A("EL-CBL-1374","electrical",5,None,P4,AR,WP,"Pull MV cable 11 kV, substation to transformer T-1","T-1",4,180,"m","6-day",[("EL-TRF-1371","FS",1),("EL-TRK-1370","FF",1)])
A("EL-CBL-1375","electrical",5,None,P4,AR,WP,"Pull MV cable 11 kV, substation to transformer T-2","T-2",4,180,"m","6-day",[("EL-TRF-1372","FS",1),("EL-TRK-1370","FF",1)])
A("EL-CBL-1376","electrical",5,None,P4,AR,WP,"Pull LV power cables, pump motors P-1401A/B","P-1401A",5,320,"m","6-day",[("EL-SWB-1373","SS",14),("EL-TRK-1360","FF",1)])
A("EL-CBL-1377","electrical",5,None,P4,AR,WP,"Pull LV power cables, wellhead panel WHCP-2101 feeders, Unit 2","WHCP-2101",4,260,"m","6-day",[("EL-TRK-1361","FF",1)])
A("EL-GRD-1378","electrical",5,None,P4,AR,WP,"Earth grid and earthing pits, site-wide",None,8,2400,"m","6-day",[("CIV-FDN-1162","FF",3)])
A("EL-GRD-1379","electrical",5,None,P4,AR,WP,"Lightning mast and down conductors, flare area",None,3,4,"nos","6-day",[("STA-FLR-1221","FF",3)])
A("EL-LTG-1380","electrical",5,None,P4,AR,WP,"Area lighting poles and floodlights, wellhead U1/U2",None,6,22,"nos","6-day",[("EL-GRD-1378","SS",5)])
A("EL-LTG-1381","electrical",5,None,P4,AR,WP,"Emergency lighting and exit signage, control building",None,2,14,"nos","6-day",[("EL-SWB-1373","FF",2)])
A("EL-CBL-1382","electrical",5,None,P4,AR,WP,"Glanding and termination, LV panels, substation",None,6,84,"nos","6-day",[("EL-CBL-1376","FF",2),("EL-CBL-1377","FF",0)])
A("EL-CBL-1383","electrical",6,"EL-CBL-1382",P4,AR,WP,"Cable glanding, MCC-1 and MCC-2 feeders",None,3,46,"nos","6-day",[("EL-CBL-1382","SS",1)])
A("EL-CBL-1384","electrical",6,"EL-CBL-1382",P4,AR,WP,"Core termination and lacing, MCC-1 and MCC-2",None,4,92,"nos","6-day",[("EL-CBL-1383","FF",0)])
AR = "Wellhead Area Unit 1"; WP = "Instrumentation Installation"
A("INS-IMP-1390","instrumentation",5,None,P4,AR,WP,"Install instrument air tubing stubs and manifolds, takeoffs from 2\"-P-2301-A6A",None,3,28,"nos","6-day",[("PIP-INS-1319","FF",1)])
A("INS-FIT-1391","instrumentation",5,None,P4,AR,WP,"Install pressure transmitters PT-1101 to PT-1114, Unit 1","PT-1101",5,14,"nos","6-day",[("PIP-ERC-1315","FF",2),("PIP-ERC-1316","FF",1)])
A("INS-FIT-1392","instrumentation",5,None,P4,AR,WP,"Install level transmitters LT-1201 to LT-1206, separators","LT-1201",4,6,"nos","6-day",[("STA-SET-1203","FF",2),("STA-INT-1213","FF",2)])
A("INS-FIT-1393","instrumentation",5,None,P4,AR,WP,"Install temperature elements TE-1301 to TE-1312","TE-1301",4,12,"nos","6-day",[("PIP-ERC-1322","FF",1)])
A("INS-FIT-1394","instrumentation",5,None,P4,AR,WP,"Install flow meter elements FE-1401 to FE-1408, Unit 2","FE-1401",4,8,"nos","6-day",[("PIP-ERC-1321","FF",2)])
A("INS-JBX-1395","instrumentation",5,None,P4,AR,WP,"Install junction boxes JB-101 to JB-108, field","JB-101",4,8,"nos","6-day",[("CIV-UGS-1180","FF",90)])
A("INS-CBL-1396","instrumentation",5,None,P4,AR,WP,"Pull instrument cables, rack tier 2 to junction boxes JB-101 to JB-108","JB-101",6,640,"m","6-day",[("INS-TRK-1363","FF",1),("INS-JBX-1395","FF",1)])
A("INS-CBL-1397","instrumentation",5,None,P4,AR,WP,"Pull home-run cables, JB-101 to JB-108 to control room FTA","JB-101",5,480,"m","6-day",[("INS-CBL-1396","FS",1),("EL-TRK-1370","FF",2)])
A("INS-TER-1398","instrumentation",5,None,P4,AR,WP,"Terminate field instruments at JB-101 to JB-108","JB-101",8,168,"nos","6-day",[("INS-CBL-1397","FF",0)])
A("INS-IMP-1399","instrumentation",5,None,P4,AR,WP,"Install ESD valve solenoids and actuation hook-up, blowdown headers 6\"-P-1302-A6A",None,4,10,"nos","6-day",[("PIP-HLT-1325","FF",20)])
A("INS-FIT-1400","instrumentation",5,None,P4,AR,WP,"Install fire and gas detectors, wellhead and manifold",None,5,32,"nos","6-day",[("PIP-ERC-1315","SS",6)])

AR = "Wellhead Area Unit 2"; WP = "Instrument Loop Checking"
A("INS-CAL-1405","instrumentation",5,None,P4,AR,WP,"Calibrate transmitters and switches, workshop bench",None,6,60,"nos","6-day",[("INS-FIT-1391","SS",7)])
A("INS-CHK-1406","instrumentation",5,None,P4,AR,WP,"Loop check, Unit 1 loops L-1101 to L-1128",None,5,28,"nos","6-day",[("INS-TER-1398","FS",3),("INS-CAL-1405","FF",3)])
A("INS-CHK-1407","instrumentation",5,None,P4,AR,WP,"Loop check, Unit 2 loops L-2101 to L-2122",None,4,22,"nos","6-day",[("INS-TER-1398","FS",4),("INS-FIT-1394","FF",2)])
A("INS-CHK-1408","instrumentation",5,None,P4,AR,WP,"Loop check, tank farm and utilities loops",None,3,16,"nos","6-day",[("INS-CHK-1407","FS",1)])
A("INS-CHK-1409","instrumentation",5,None,P4,AR,WP,"Cause and effect testing, ESD shutdown matrix",None,8,14,"nos","6-day",[("INS-CHK-1406","FF",2),("INS-CHK-1407","FF",2),("INS-IMP-1399","FF",1)])
# ================= PHASE 5 : Pre-commissioning, Testing and Handover =================
AR = "Site-wide"; WP = "Mechanical Completion"
A("HSE-MS-1500","hse",5,None,P5,AR,WP,"Mechanical Completion Unit 1",None,0,0,"","7-day",[("STA-SET-1244","FF",15),("PIP-HLT-1325","FF",2)])
A("HSE-MS-1501","hse",5,None,P5,AR,WP,"Mechanical Completion Unit 2",None,0,0,"","7-day",[("PIP-BLT-1324","FF",5)])
A("HSE-MS-1502","hse",5,None,P5,AR,WP,"Mechanical Completion, Tank Farm and Utilities",None,0,0,"","7-day",[("PIP-WLD-1344","FF",2),("PIP-ERC-1354","FF",1)])

AR = "Site-wide"; WP = "Testing and Hydrotest"
A("PIP-HYT-1510","piping",5,None,P5,AR,WP,"Hydrotest package 1, Unit 1 lines 16\"-P-1002-A1A and 12\"-P-1003-A5A",None,3,4,"nos","7-day",[("HSE-MS-1500","FS",0)])
A("PIP-HYT-1511","piping",5,None,P5,AR,WP,"Hydrotest package 2, Unit 2 header 20\"-P-2001-A1A",None,3,3,"nos","7-day",[("HSE-MS-1501","FS",0)])
A("PIP-HYT-1512","piping",5,None,P5,AR,WP,"Pneumatic leak test with nitrogen, flare header","18\"-P-1301-B7A",2,2,"nos","7-day",[("PIP-WLD-1332","FF",60),("HSE-MS-1502","FS",0)])
A("PIP-HYT-1513","piping",5,None,P5,AR,WP,"Hydrotest, tank farm manifold and pump suction","12\"-P-2101-A1A",2,3,"nos","7-day",[("HSE-MS-1502","FS",0)])
A("PIP-FLS-1514","piping",5,None,P5,AR,WP,"Flush, dry and reinstate, test packs 1-3",None,4,12,"nos","7-day",[("PIP-HYT-1510","FF",1),("PIP-HYT-1511","FF",0)])
A("PIP-DRY-1515","piping",5,None,P5,AR,WP,"Air blowing and drying, instrument air header","2\"-P-2301-A6A",2,1,"nos","7-day",[("PIP-ERC-1350","FF",60),("HSE-MS-1501","FS",0)])

AR = "Site-wide"; WP = "Pre-commissioning"
A("STA-PRS-1520","static_equipment",5,None,P5,AR,WP,"Tightness and pressure test, separators V-1101 and V-1201","V-1101",2,2,"nos","7-day",[("PIP-HYT-1510","FF",1)])
A("STA-DRY-1521","static_equipment",5,None,P5,AR,WP,"Water fill and settlement check, TK-2101","TK-2101",6,940,"m3","7-day",[("STA-TNK-1233","FF",110)])
A("STA-DRY-1522","static_equipment",5,None,P5,AR,WP,"Water fill and calibration strapping, TK-2102","TK-2102",6,1010,"m3","7-day",[("STA-TNK-1235","FF",120)])
A("STA-ROT-1523","static_equipment",5,None,P5,AR,WP,"Motor bump test, pumps P-1401A/B","P-1401A",2,2,"nos","7-day",[("PIP-HYT-1513","FF",1)])
A("STA-ROT-1524","static_equipment",5,None,P5,AR,WP,"Performance run, crude transfer pumps P-1401A/B","P-1401A",2,2,"nos","7-day",[("STA-ROT-1523","FF",2)])
A("STA-CMP-1525","static_equipment",5,None,P5,AR,WP,"Load test, compressor package PK-2401","PK-2401",2,1,"nos","7-day",[("EL-ENS-1532","FS",1)])
A("STA-FLS-1526","static_equipment",5,None,P5,AR,WP,"Flare pilot ignition and pilot line purge test","FST-1301",1,1,"nos","7-day",[("PIP-HYT-1512","FF",2),("EL-ENS-1532","FS",1)])
A("STA-RUN-1527","static_equipment",5,None,P5,AR,WP,"72-hour integrated reliability run, process train",None,4,1,"nos","7-day",[("HSE-HDO-1554","FS",0)])
AR = "Substation Area"; WP = "Electrical and Instrument Completion"
A("EL-ENS-1530","electrical",5,None,P5,AR,WP,"Insulation resistance and hi-pot tests, MV cables to T-1 and T-2",None,3,6,"nos","6-day",[("EL-CBL-1375","FF",45),("EL-CBL-1382","FF",15)])
A("EL-ENS-1531","electrical",5,None,P5,AR,WP,"Protective relay setting and primary injection tests",None,4,12,"nos","6-day",[("EL-ENS-1530","FF",1)])
A("EL-ENS-1532","electrical",5,None,P5,AR,WP,"Substation energization",None,0,0,"","7-day",[("EL-ENS-1531","FF",10)])
A("INS-CHK-1540","instrumentation",5,None,P5,AR,WP,"Revalidation of loop checks, post hydrotest",None,3,66,"nos","7-day",[("PIP-HYT-1511","FF",3),("PIP-HYT-1513","FF",3)])
A("INS-CMS-1541","instrumentation",5,None,P5,AR,WP,"Fire and gas detection system function test",None,4,32,"nos","7-day",[("INS-FIT-1400","FF",4),("EL-ENS-1532","FS",0)])
A("INS-CHK-1542","instrumentation",5,None,P5,AR,WP,"Integrated ESD and blowdown function test",None,3,8,"nos","7-day",[("INS-CHK-1409","FF",3),("EL-ENS-1532","FS",0),("INS-CHK-1540","FF",2)])
A("INS-MS-1543","instrumentation",5,None,P5,AR,WP,"Instrument loops certified (RFSI)",None,0,0,"","7-day",[("INS-CMS-1541","FF",1),("INS-CHK-1406","FF",1),("INS-CHK-1407","FF",1),("INS-CHK-1408","FF",1)])
A("HSE-REG-1544","hse",5,None,P5,AR,WP,"PESO statutory inspection, tanks TK-2101 and TK-2102",None,5,2,"nos","7-day",[("HSE-REG-1545","SS",2)])
A("HSE-REG-1545","hse",5,None,P5,AR,WP,"PESO statutory inspection, flare system and pressure vessels V-1101/V-1201/V-2101",None,4,8,"nos","7-day",[("PIP-HYT-1512","FF",1),("STA-PRS-1520","FF",1)])
A("HSE-REG-1546","hse",5,None,P5,AR,WP,"PCB consent and factory inspectorate compliance walkthrough",None,3,0,"","7-day",[("HSE-REG-1545","FS",1)])

AR = "Site-wide"; WP = "Handover"
A("HSE-PSC-1550","hse",5,None,P5,AR,WP,"Pre-startup safety review (PSSR) walkthrough",None,3,1,"nos","7-day",[("INS-MS-1543","FS",1),("HSE-REG-1546","FF",2),("STA-FLS-1526","FF",2)])
A("HSE-DOC-1551","hse",5,None,P5,AR,WP,"As-built markup verification and red-line transfer",None,8,0,"","7-day",[("INS-CHK-1540","FF",2)])
A("HSE-DOC-1552","hse",5,None,P5,AR,WP,"Compilation of handover dossiers and O&M manuals",None,10,0,"","7-day",[("HSE-DOC-1551","SS",4)])
A("HSE-TRN-1553","hse",5,None,P5,AR,WP,"Operations training and familiarization, OIL staff",None,5,24,"nos","7-day",[("HSE-PSC-1550","SS",1)])
A("HSE-HDO-1554","hse",5,None,P5,AR,WP,"RFSU Unit 1",None,0,0,"","7-day",[("HSE-PSC-1550","FF",1),("INS-CHK-1542","FF",1)])
A("HSE-HDO-1555","hse",5,None,P5,AR,WP,"RFSU Unit 2",None,0,0,"","7-day",[("HSE-HDO-1554","FS",30)])
A("STA-MS-1556","static_equipment",5,None,P5,AR,WP,"First crude transfer to TK-2101",None,0,0,"","7-day",[("STA-RUN-1527","FF",45)])
A("HSE-HDO-1557","hse",5,None,P5,AR,WP,"Provisional handover to Operations",None,0,0,"","7-day",[("HSE-HDO-1555","FS",7),("HSE-DOC-1552","FF",15),("STA-MS-1556","FF",5)])
A("HSE-PUN-1558","hse",5,None,P5,AR,WP,"Punchlist closure, category A and B items",None,5,38,"nos","7-day",[("HSE-HDO-1557","SS",2)])
A("HSE-DOC-1559","hse",5,None,P5,AR,WP,"As-built drawing submission and document close-out to OIL",None,10,0,"","7-day",[("HSE-HDO-1557","FS",3)])
# ================= SCHEDULING ENGINE =================
IDX = {a["id"]: a for a in ACTS}
assert len(IDX) == len(ACTS), "duplicate activity ids"
for a in ACTS:
    for pid, rel, lag in a["preds"]:
        assert pid in IDX, "missing predecessor %s for %s" % (pid, a["id"])
        assert rel in ("FS", "SS", "FF", "SF"), "bad rel in %s" % a["id"]

def is_work(d, cal):
    return d.weekday() != 6 if cal == "6-day" else True

def next_work(d, cal):
    while not is_work(d, cal):
        d += timedelta(days=1)
    return d

def add_work(d, n, cal):
    while n > 0:
        d += timedelta(days=1)
        if is_work(d, cal):
            n -= 1
    return d

def sub_work(d, n, cal):
    while n > 0:
        d -= timedelta(days=1)
        if is_work(d, cal):
            n -= 1
    return d

ST, VISITING = {}, set()

def sched(aid):
    if aid in ST:
        return ST[aid]
    assert aid not in VISITING, "logic cycle at %s" % aid
    VISITING.add(aid)
    a = IDX[aid]; cal = a["cal"]
    es, efmin = None, None
    for pid, rel, lag in a["preds"]:
        ps, pf = sched(pid)
        if rel == "FS":
            c = next_work(pf + timedelta(days=lag + 1), cal)
            es = c if es is None or c > es else es
        elif rel == "SS":
            c = next_work(ps + timedelta(days=lag), cal)
            es = c if es is None or c > es else es
        elif rel == "FF":
            c = pf + timedelta(days=lag)
            efmin = c if efmin is None or c > efmin else efmin
        else:  # SF
            c = ps + timedelta(days=lag)
            efmin = c if efmin is None or c > efmin else efmin
    if a["dur"] == 0:
        cands = []
        if es is not None:
            cands.append(es)
        if efmin is not None:
            cands.append(next_work(efmin, cal))
        s = max(cands)
        f = s
    else:
        if efmin is not None:
            c = next_work(efmin, cal)
            es = c if es is None or c > es else es
        s = es if es is not None else date.fromisoformat(a["seed"])
        f = add_work(s, a["dur"] - 1, cal)
        if efmin is not None and f < efmin:
            f = next_work(efmin, cal)
            s = sub_work(f, a["dur"] - 1, cal)
    VISITING.discard(aid)
    ST[aid] = (s, f)
    return s, f

for a in ACTS:
    sched(a["id"])
# ================= VALIDATION =================
LO, HI = date(2026, 3, 1), date(2027, 3, 31)
DISC = {"civil", "piping", "static_equipment", "electrical", "instrumentation", "hse"}
errors = []
for a in ACTS:
    s, f = ST[a["id"]]
    if not (LO <= s <= HI and LO <= f <= HI):
        errors.append("date out of bounds: %s %s-%s" % (a["id"], s, f))
    if a["disc"] not in DISC:
        errors.append("bad discipline: %s" % a["id"])
    if a["dur"] == 0 and s != f:
        errors.append("milestone not zero-duration: %s" % a["id"])
    for pid, rel, lag in a["preds"]:
        ps, pf = ST[pid]
        if rel == "FS" and s < pf + timedelta(days=lag + 1):
            errors.append("FS violation %s <- %s" % (a["id"], pid))
        if rel == "SS" and s < ps + timedelta(days=lag):
            errors.append("SS violation %s <- %s" % (a["id"], pid))
        if rel == "FF" and f < pf + timedelta(days=lag):
            errors.append("FF violation %s <- %s" % (a["id"], pid))
        if rel == "SF" and f < ps + timedelta(days=lag):
            errors.append("SF violation %s <- %s" % (a["id"], pid))

milestones = [a for a in ACTS if a["dur"] == 0]
zero_qty = [a for a in ACTS if a["qty"] == 0]
no_tag = [a for a in ACTS if a["tag"] is None]
assert 180 <= len(ACTS) <= 220, "activity count %d" % len(ACTS)
assert 8 <= len(milestones) <= 12, "milestone count %d" % len(milestones)

if errors:
    print("VALIDATION ERRORS:")
    for e in errors:
        print("  ", e)
    raise SystemExit(1)

# ================= OUTPUT =================
def path_of(a):
    p = [L1, a["phase"], a["area"], a["wp"]]
    if a["level"] == 6 and a["parent"]:
        p.append(IDX[a["parent"]]["desc"])
    p.append(a["desc"])
    return p

out = []
for a in ACTS:
    s, f = ST[a["id"]]
    out.append({
        "activity_id": a["id"],
        "wbs_path": path_of(a),
        "wbs_level": a["level"],
        "description": a["desc"],
        "discipline": a["disc"],
        "tag": a["tag"],
        "planned_start": s.isoformat(),
        "planned_finish": f.isoformat(),
        "planned_qty": a["qty"],
        "uom": a["uom"],
        "predecessors": [{"activity_id": pid, "rel": rel, "lag_days": lag}
                         for pid, rel, lag in a["preds"]],
        "calendar": a["cal"],
    })

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2, ensure_ascii=False)

# ================= SUMMARY =================
print("activities:", len(ACTS))
print("by discipline:", {d: sum(1 for a in ACTS if a["disc"] == d) for d in sorted(DISC)})
print("L6 sub-activities:", sum(1 for a in ACTS if a["level"] == 6))
print("milestones:", len(milestones), "->", ", ".join("%s (%s)" % (a["desc"], ST[a["id"]][0]) for a in milestones))
print("zero-qty:", [a["id"] for a in zero_qty])
print("no-tag: %d (%.0f%%)" % (len(no_tag), 100.0 * len(no_tag) / len(ACTS)))
import re
tagpat = re.compile(r"\d+\"-P-\d{4}-[A-Z0-9]{2,3}\b|\b[A-Z]{1,4}-\d{1,4}[AB]?\b")
prose_only = [a for a in ACTS if not tagpat.search(a["desc"])]
print("prose-only descriptions: %d (%.0f%%)" % (len(prose_only), 100.0 * len(prose_only) / len(ACTS)))
print("project: %s .. %s" % (min(ST[a["id"]][0] for a in ACTS), max(ST[a["id"]][1] for a in ACTS)))
for ph in (P1, P2, P3, P4, P5):
    acts = [a for a in ACTS if a["phase"] == ph]
    print("  %-46s %d acts  %s .. %s" % (ph, len(acts),
          min(ST[a["id"]][0] for a in acts), max(ST[a["id"]][1] for a in acts)))