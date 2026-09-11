/**
 * NAVIS Multilingual Translation Layer (English / Hindi / Assamese).
 *
 * Provides real-time UI translation for the Field Supervisor interface,
 * synchronized with speech recognition language preferences and local storage.
 */
import { useEffect, useState } from 'react';
import { LANGUAGES } from '../config';

export type LanguageCode = (typeof LANGUAGES)[number]['code']; // 'en-IN' | 'hi-IN' | 'as-IN'

const STORAGE_KEY = 'navis.speech_lang';

const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  'en-IN': {
    // Shell & Navigation
    'app_name': 'NAVIS Field',
    'app_sub': 'Site Capture OS',
    'operations': 'Operations',
    'nav_home': 'Home',
    'nav_updates': 'My Updates',
    'nav_clarifications': 'Clarifications',
    'nav_preferences': 'Preferences',
    'light_mode': 'Light mode',
    'dark_mode': 'Dark mode',
    'switch_role': 'Switch role',
    'ask_navis': 'Ask NAVIS',
    'online': 'Online',
    'offline': 'Offline — auto-sync',
    'offline_desc': 'Offline Mode active. Updates will be cached safely on device and synced when signal returns.',

    // Field Home (Idle Stage)
    'home_title': 'What happened on site today?',
    'home_subtitle': 'Record work progress, material arrivals, site constraints, and inspections.',
    'composer_placeholder': "Tell NAVIS what happened on site... or type your update (e.g. 'Poured 40 m3 on the raft at Pad-04' or 'Delayed by rain')",
    'record_voice': 'Record Voice',
    'photo': 'Photo',
    'attach': 'Attach',
    'send_update': 'Send Update',
    'quick_presets': 'QUICK PRESETS',
    'prefills_format': 'PREFILLS SCOPE & FORMAT',
    'preset_progress': 'Work Progress',
    'preset_progress_sub': 'Erection & fit-up',
    'preset_material': 'Material Delivery',
    'preset_material_sub': 'Spools & valves',
    'preset_delay': 'Delay / Constraint',
    'preset_delay_sub': 'Weather & access',
    'preset_inspection': 'Inspection',
    'preset_inspection_sub': 'Hydrotest & NDT',

    // Clarifications / Planning Requests
    'req_from_planning': 'Requests from Planning',
    'no_requests': '✓ No requests from Planning',
    'no_requests_sub': 'Nothing outstanding · Questions from the planner will appear here',
    'require_response': 'require your response',
    'answered': 'answered',
    'needs_response': 'Needs response',
    'all': 'All',
    'respond': 'Respond',
    'send_response': 'Send Response',
    'cancel': 'Cancel',

    // Context & Shift
    'current_context': 'Current Context',
    'change': 'Change',
    'done': 'Done',
    'day_shift': 'Day Shift (06:00 - 18:00)',
    'night_shift': 'Night Shift (18:00 - 06:00)',
    'recent_updates': 'Recent Updates',
    'needs_your_response': 'Needs Your Response',

    // Voice Recording Stages
    'listening': 'Listening...',
    'listening_hint': 'Speak naturally in English, Hindi, or Assamese...',
    'stop_review': 'Stop & Review',

    // Preferences Page
    'pref_title': 'Preferences',
    'pref_sub': 'Personalize how NAVIS works for you.',
    'pref_theme': 'Appearance & Theme',
    'pref_theme_sub': 'Choose your interface theme. Updates apply instantly across all screens.',
    'pref_lang': 'Language & Voice Input',
    'pref_lang_sub': 'Configure spoken language for voice notes and text entry.',
    'pref_lang_note': 'Speech recognition runs in the browser. Nothing is recorded or sent to a speech service.',
    'pref_assignment': 'Current Assignment',
    'read_only': 'READ-ONLY',
    'back_home': 'Back to home',
    'return_role': 'Return to role selection',

    // Clarifications Drawer & Work Queue
    'search_clarifications': 'Search clarifications...',
    'respond_to_planning': 'Respond to Planning',
    'original_field_report': 'Original Field Report',
    'your_response': 'Your response',
    'record_voice_resp': 'Record voice response',
    'response_sent': 'Response sent to Planning Engineer',

    // Conversation Stage
    'data_entry_session': 'Data Entry Session',
    'close': 'Close',
    'supervisor': 'Supervisor',
    'navis_assistant': 'NAVIS Assistant',
    'assistant_thinking': 'NAVIS Assistant is thinking…',
    'ready_to_draft': 'READY TO DRAFT',
    'have_enough': 'I have enough to prepare the update.',
    'review_structured_update': 'Review Structured Update',
    'extracted_data_msg': "Got it. I've extracted the structured data from your update. Please review it below.",
    'answer_by_voice': 'Answer by voice',
    'type_update_placeholder': 'Or type your update',
    'type_update_prompt': 'Type your update',
    'today': 'Today',
    'yesterday': 'Yesterday',

    // Chips & Fields
    'chip_activity': 'Activity',
    'chip_discipline': 'Discipline',
    'chip_location': 'Location',
    'chip_status': 'Status',
    'chip_date': 'Date',
    'chip_quantity': 'Quantity',

    // Structured Card
    'structured_update': 'STRUCTURED UPDATE',
    'confidence': 'Confidence',
    'strong_match': 'strong match',
    'planner_confirms': 'planner confirms',
    'confirm_submit': 'CONFIRM & SUBMIT',
    'submitting': 'Submitting…',
    'qty_over_planned_warn': 'Completed exceeds the planned total — the Planning Engineer will check this',
    'submit_disclaimer': 'Submitting confirms the report information only. The Planning Engineer must review it before any project data changes.',
    'not_stated': 'Not stated',

    // Submitted Stage
    'update_captured': '✓ UPDATE CAPTURED',
    'update_submitted_title': 'Update submitted',
    'sent_for_review': 'Sent for Planning Engineer review.',
    'schedule_unchanged': 'The project schedule has not been changed.',
    'extraction_summary': 'NAVIS Extraction Summary',
    'verified': 'Verified',
    'work_activity': 'Work / Activity',
    'equipment_tag': 'Equipment / Tag',
    'report_reference': 'Report reference',
    'ready_for_review': 'Ready for PM Review',
    'submit_another': 'Submit another update',
    'view_in_my_updates': 'View in My Updates',

    // Listening & Transcript
    'recording': 'Recording',
    'tap_to_finish': 'Tap to finish',
    'speak_now_hint': 'Speak now… dictating site update',
    'still_listening': 'still listening…',
    'check_transcript_title': 'Check your transcript',
    'check_transcript_desc': 'Check this before sending — speech recognition can mishear equipment numbers.',
    'submit_update': 'Submit Update',
    'redo': 'Redo',

    // Fallbacks
    'mic_unavailable_title': 'Microphone is not available',
    'mic_unavailable_desc': 'Your browser or device has not enabled voice permissions. You can still type your update below.',
    'not_understood_title': 'Could not understand audio',
    'not_understood_desc': 'The microphone did not detect clear speech. Please speak closer or try typing.',
    'server_unreachable_title': 'Server unreachable',

    // Field Reports / My Updates
    'my_updates_title': 'My Updates',
    'my_updates_sub': 'Track submitted site updates, schedule matching, and review status.',
    'filter_processing': 'Processing',
    'filter_confirmed': 'Confirmed',
    'filter_rejected': 'Rejected',
    'no_reports_yet': 'No reports yet',
    'reports_appear_here': 'Your submitted updates will appear here.',

    // Report Studio / Submission Flow
    'report_progress': 'Report Progress',
    'capture': 'Capture',
    'review': 'Review',
    'submit': 'Submit',
    'what_happened': 'What happened?',
    'what_happened_sub': 'Describe work completed, line or spool number, quantity, or site conditions.',
    'report_placeholder': "Describe site progress (e.g. '40 metres of 8-inch piping installed near P-101 on Rack P1, hydrotest pre-checks passed')...",
    'voice': 'Voice',
    'stop_recording': 'Stop Recording',
    'photos': 'Photos',
    'documents': 'Documents',
    'report_details': 'Report details',
    'report_details_sub': 'Structured parameters to strengthen automated schedule linking',
    'optional': 'optional',
    'quantity': 'Quantity',
    'unit': 'Unit',
    'unit_placeholder': 'm, spools, nos, m³',
    'status': 'Status',
    'status_in_progress': 'In Progress',
    'status_completed': 'Completed',
    'status_delayed': 'Delayed',
    'status_under_inspection': 'Under Inspection',
    'equipment_tag_label': 'Equipment / Tag',
    'equipment_tag_placeholder': 'P-101, SP-04...',
    'delay_constraint': 'Delay / Constraint',
    'delay_constraint_placeholder': 'None (or describe weather delay, permit hold, material shortage)',
    'checking_report': 'Checking your report',
    'checking_report_sub': 'Reading it against the schedule. Nothing is stored yet.',
    'check_report': 'Check report →',
    'check_again': 'Check again',
    'checking': 'Checking…',
    'report_check_notice': 'Report will be checked against the project schedule before submission.',
    'report_edited_notice': 'Report edited — check it again',
    'context': 'Context',
    'context_sub': 'Site execution context sent with this report',
    'workfront': 'Workfront',
    'work_date': 'Work date',
    'shift_label': 'Shift',
    'change_context': 'Change context',
    'done_changing_context': 'Done changing context',
    'select_workfront': 'Select Workfront',
    'select_discipline': 'Select Discipline',
    'select_work_date': 'Select Work Date',
    'schedule_verification': 'Schedule verification',
    'schedule_verification_sub': 'Matched against OIL Well Pad 04 baseline (120 activities).',
    'return_to_home': 'Return to Home',
    'back_to_field_os': 'Back to Field OS',
    'step_review_header': 'STEP 2 · NAVIS REVIEW',
    'review_your_report': 'Review your report',
    'confidence_label': 'confidence',
    'what_you_reported': 'What you reported',
    'navis_extracted': 'NAVIS EXTRACTED',
    'matched_against_schedule': 'Matched against project schedule',
    'you_selected': 'you selected',
    'read_from_report': 'read from your report',
    'unmatched_notice_title': 'No matching activity found',
    'unmatched_notice_sub': 'The update is complete, but cannot be automatically linked. If submitted, a planner will place it.',
    'send_for_planner_to_place': 'Send for a planner to place',
    'send_to_planner_review': 'Send to planner review',
    'cancel_report': 'Cancel',
    'update_recorded': '✓ Update Recorded',
    'sent_for_planner_review': 'Sent for planner review',
    'schedule_not_changed_yet': 'The project schedule has not been changed yet. A Planning Engineer must verify this report before actuals are committed.',
    'submit_another_report': 'Submit Another Report',
    'activity_label': 'Activity',
    'submit_for_planner_review': 'Submit for Planner Review',
    'submission_target': 'Submission Target',
    'ready_to_dispatch': 'Ready to Dispatch',
    'assigned_workfront': 'Assigned Workfront',
    'routing_queue': 'Routing Queue',
    'planning_recon_queue': 'Planning Reconciliation Queue',
    'target_schedule_baseline': 'Target Schedule Baseline',
    'baseline_protection': 'Baseline Protection',
    'baseline_protection_sub': 'Planned dates will not change automatically. The planning team verifies this entry against activity baselines before reconciliation.',
    'non_destructive_reporting': 'Non-destructive field reporting',
    'edit_report': '← Edit',
    'attachments_title': 'ATTACHMENTS',
    'no_attachments': 'No attachments attached to this report.',
    'choose_one': 'Choose one:',
    'missing_detail_placeholder': 'Type the missing detail…',
    'send_btn': 'Send',
    'details_needed_title': 'A few details needed',
    'invalid_report_title': 'This does not look like a site report',
    'examples_title': 'Examples of what to report',

    // Common
    'project': 'Project',
    'discipline': 'Discipline',
    'work_front': 'Work Front',
    'shift': 'Shift',
    'data_date': 'Data Date',
  },

  'hi-IN': {
    // Shell & Navigation
    'app_name': 'NAVIS फील्ड',
    'app_sub': 'साइट कैप्चर ओएस',
    'operations': 'संचालन',
    'nav_home': 'मुख्य पृष्ठ',
    'nav_updates': 'मेरी रिपोर्टें',
    'nav_clarifications': 'स्पष्टीकरण',
    'nav_preferences': 'प्राथमिकताएं',
    'light_mode': 'लाइट मोड',
    'dark_mode': 'डार्क मोड',
    'switch_role': 'भूमिका बदलें',
    'ask_navis': 'NAVIS से पूछें',
    'online': 'ऑनलाइन',
    'offline': 'ऑफलाइन — ऑटो-सिंक',
    'offline_desc': 'ऑफलाइन मोड सक्रिय। अपडेट डिवाइस पर सुरक्षित रहेंगे और सिग्नल मिलने पर सिंक होंगे।',

    // Field Home (Idle Stage)
    'home_title': 'आज साइट पर क्या काम हुआ?',
    'home_subtitle': 'कार्य प्रगति, सामग्री आगमन, साइट बाधाएं और निरीक्षण दर्ज करें।',
    'composer_placeholder': "NAVIS को बताएं कि साइट पर क्या हुआ... या टाइप करें (उदा. 'पैड-04 पर राफ्ट कंक्रीटिंग 40 m3' या 'बारिश से देरी')",
    'record_voice': 'आवाज़ रिकॉर्ड करें',
    'photo': 'फ़ोटो',
    'attach': 'फ़ाइल जोड़ें',
    'send_update': 'अपडेट भेजें',
    'quick_presets': 'त्वरित प्रीसेट',
    'prefills_format': 'प्रारूप स्वतः भरें',
    'preset_progress': 'कार्य प्रगति',
    'preset_progress_sub': 'इरेक्शन और फिट-अप',
    'preset_material': 'सामग्री डिलीवरी',
    'preset_material_sub': 'स्पूल और वाल्व',
    'preset_delay': 'देरी / बाधा',
    'preset_delay_sub': 'मौसम और पहुंच',
    'preset_inspection': 'निरीक्षण',
    'preset_inspection_sub': 'हाइड्रोटेस्ट और एनडीटी',

    // Clarifications / Planning Requests
    'req_from_planning': 'प्लानिंग से अनुरोध',
    'no_requests': '✓ प्लानिंग से कोई अनुरोध नहीं',
    'no_requests_sub': 'कोई लंबित कार्य नहीं · प्लानर के प्रश्न यहाँ दिखाई देंगे',
    'require_response': 'उत्तर अपेक्षित',
    'answered': 'उत्तर दिया गया',
    'needs_response': 'उत्तर अपेक्षित',
    'all': 'सभी',
    'respond': 'उत्तर दें',
    'send_response': 'उत्तर भेजें',
    'cancel': 'रद्द करें',

    // Context & Shift
    'current_context': 'वर्तमान संदर्भ',
    'change': 'बदलें',
    'done': 'हो गया',
    'day_shift': 'दिन की पाली (06:00 - 18:00)',
    'night_shift': 'रात की पाली (18:00 - 06:00)',
    'recent_updates': 'हाल के अपडेट',
    'needs_your_response': 'आपकी प्रतिक्रिया आवश्यक',

    // Voice Recording Stages
    'listening': 'सुन रहा हूँ...',
    'listening_hint': 'हिंदी, अंग्रेजी या असमिया में स्वाभाविक रूप से बोलें...',
    'stop_review': 'रोकें और जांचें',

    // Preferences Page
    'pref_title': 'प्राथमिकताएं',
    'pref_sub': 'NAVIS को अपनी पसंद के अनुसार अनुकूलित करें।',
    'pref_theme': 'दिखावट और थीम',
    'pref_theme_sub': 'अपनी इंटरफ़ेस थीम चुनें। अपडेट तुरंत लागू होते हैं।',
    'pref_lang': 'भाषा और आवाज़ इनपुट',
    'pref_lang_sub': 'आवाज़ नोट्स और टेक्स्ट प्रविष्टि के लिए बोली जाने वाली भाषा कॉन्फ़िगर करें।',
    'pref_lang_note': 'वाक् पहचान ब्राउज़र में चलती है। कोई डेटा बाहर नहीं भेजा जाता है।',
    'pref_assignment': 'वर्तमान कार्यभार',
    'read_only': 'केवल पढ़ने योग्य',
    'back_home': 'मुख्य पृष्ठ पर वापस जाएं',
    'return_role': 'भूमिका चयन पर वापस जाएं',

    // Clarifications Drawer & Work Queue
    'search_clarifications': 'स्पष्टीकरण खोजें...',
    'respond_to_planning': 'प्लानिंग को उत्तर दें',
    'original_field_report': 'मूल फील्ड रिपोर्ट',
    'your_response': 'आपकी प्रतिक्रिया',
    'record_voice_resp': 'आवाज़ से उत्तर रिकॉर्ड करें',
    'response_sent': 'प्लानिंग इंजीनियर को उत्तर भेजा गया',

    // Conversation Stage
    'data_entry_session': 'डेटा प्रविष्टि सत्र',
    'close': 'बंद करें',
    'supervisor': 'पर्यवेक्षक',
    'navis_assistant': 'NAVIS सहायक',
    'assistant_thinking': 'NAVIS सहायक विचार कर रहा है…',
    'ready_to_draft': 'प्रारूप तैयार करने के लिए तैयार',
    'have_enough': 'मेरे पास अपडेट तैयार करने के लिए पर्याप्त जानकारी है।',
    'review_structured_update': 'संरचित अपडेट की समीक्षा करें',
    'extracted_data_msg': 'समझ गया। मैंने आपके अपडेट से संरचित डेटा निकाल लिया है। कृपया नीचे इसकी समीक्षा करें।',
    'answer_by_voice': 'आवाज़ से उत्तर दें',
    'type_update_placeholder': 'या अपना अपडेट टाइप करें',
    'type_update_prompt': 'अपना अपडेट टाइप करें',
    'today': 'आज',
    'yesterday': 'कल',

    // Chips & Fields
    'chip_activity': 'गतिविधि',
    'chip_discipline': 'विभाग',
    'chip_location': 'स्थान',
    'chip_status': 'स्थिति',
    'chip_date': 'तारीख',
    'chip_quantity': 'मात्रा',

    // Structured Card
    'structured_update': 'संरचित अपडेट',
    'confidence': 'सटीकता (Confidence)',
    'strong_match': 'सटीक मेल',
    'planner_confirms': 'प्लानर पुष्टि करेंगे',
    'confirm_submit': 'पुष्टि करें और भेजें',
    'submitting': 'भेजा जा रहा है…',
    'qty_over_planned_warn': 'पूर्ण मात्रा नियोजित से अधिक है — प्लानिंग इंजीनियर इसकी जांच करेंगे',
    'submit_disclaimer': 'सबमिट करने से केवल रिपोर्ट जानकारी दर्ज होती है। प्लानिंग इंजीनियर की समीक्षा के बाद ही प्रोजेक्ट डेटा बदलेगा।',
    'not_stated': 'उल्लेख नहीं',

    // Submitted Stage
    'update_captured': '✓ अपडेट रिकॉर्ड हुआ',
    'update_submitted_title': 'अपडेट सबमिट हो गया',
    'sent_for_review': 'प्लानिंग इंजीनियर की समीक्षा के लिए भेजा गया।',
    'schedule_unchanged': 'प्रोजेक्ट शेड्यूल में अभी कोई बदलाव नहीं हुआ है।',
    'extraction_summary': 'NAVIS निष्कर्ष सारांश',
    'verified': 'सत्यापित',
    'work_activity': 'कार्य / गतिविधि',
    'equipment_tag': 'उपकरण / टैग',
    'report_reference': 'रिपोर्ट संदर्भ',
    'ready_for_review': 'पीएम समीक्षा के लिए तैयार',
    'submit_another': 'एक और अपडेट भेजें',
    'view_in_my_updates': 'मेरी रिपोर्टें में देखें',

    // Listening & Transcript
    'recording': 'रिकॉर्डिंग',
    'tap_to_finish': 'समाप्त करने के लिए टैप करें',
    'speak_now_hint': 'बोलें… साइट अपडेट डिक्टेट कर रहे हैं',
    'still_listening': 'सुन रहा हूँ…',
    'check_transcript_title': 'अपनी ट्रांसक्रिप्ट की जांच करें',
    'check_transcript_desc': 'भेजने से पहले जांच लें — आवाज़ पहचान कभी-कभी उपकरण संख्या गलत समझ सकती है।',
    'submit_update': 'अपडेट सबमिट करें',
    'redo': 'पुनः रिकॉर्ड करें',

    // Fallbacks
    'mic_unavailable_title': 'माइक्रोफ़ोन उपलब्ध नहीं है',
    'mic_unavailable_desc': 'माइक्रोफ़ोन की अनुमति सक्षम नहीं है। आप नीचे टाइप कर सकते हैं।',
    'not_understood_title': 'आवाज़ समझ नहीं आई',
    'not_understood_desc': 'माइक्रोफ़ोन को स्पष्ट आवाज़ नहीं मिली। कृपया पास आकर बोलें या टाइप करें।',
    'server_unreachable_title': 'सर्वर से संपर्क नहीं हो सका',

    // Field Reports / My Updates
    'my_updates_title': 'मेरी रिपोर्टें',
    'my_updates_sub': 'सबमिट किए गए साइट अपडेट, उनका शेड्यूल मिलान और समीक्षा स्थिति ट्रैक करें।',
    'filter_processing': 'प्रक्रियाधीन',
    'filter_confirmed': 'पुष्टीकृत',
    'filter_rejected': 'अस्वीकृत',
    'no_reports_yet': 'अभी तक कोई रिपोर्ट नहीं',
    'reports_appear_here': 'आपके द्वारा सबमिट किए गए अपडेट यहां दिखाई देंगे।',

    // Report Studio / Submission Flow
    'report_progress': 'कार्य प्रगति दर्ज करें',
    'capture': 'विवरण भरें',
    'review': 'समीक्षा',
    'submit': 'सबमिट करें',
    'what_happened': 'साइट पर क्या काम हुआ?',
    'what_happened_sub': 'पूर्ण कार्य, लाइन या स्पूल संख्या, मात्रा, या साइट स्थिति का विवरण दें।',
    'report_placeholder': "साइट प्रगति का विवरण दें (उदा. 'रैक P1 पर P-101 के पास 40 मीटर 8-इंच पाइपिंग स्थापित, हाइड्रोटेस्ट पास')...",
    'voice': 'आवाज़',
    'stop_recording': 'रिकॉर्डिंग रोकें',
    'photos': 'तस्वीरें',
    'documents': 'दस्तावेज़',
    'report_details': 'रिपोर्ट का विवरण',
    'report_details_sub': 'स्वचालित शेड्यूल लिंकिंग को मजबूत करने के लिए संरचित पैरामीटर',
    'optional': 'वैकल्पिक',
    'quantity': 'मात्रा (Quantity)',
    'unit': 'इकाई (Unit)',
    'unit_placeholder': 'मीटर, स्पूल, संख्या, घन मीटर',
    'status': 'स्थिति (Status)',
    'status_in_progress': 'प्रगति पर है (In Progress)',
    'status_completed': 'पूर्ण (Completed)',
    'status_delayed': 'विलंबित (Delayed)',
    'status_under_inspection': 'निरीक्षण में (Under Inspection)',
    'equipment_tag_label': 'उपकरण / टैग',
    'equipment_tag_placeholder': 'P-101, SP-04...',
    'delay_constraint': 'देरी / बाधा',
    'delay_constraint_placeholder': 'कोई नहीं (या मौसम की देरी, परमिट रोक, सामग्री की कमी बताएं)',
    'checking_report': 'आपकी रिपोर्ट जांची जा रही है',
    'checking_report_sub': 'इसे शेड्यूल के आधार पर जांचा जा रहा है। अभी कुछ भी सेव नहीं हुआ है।',
    'check_report': 'रिपोर्ट जांचें →',
    'check_again': 'पुनः जांचें',
    'checking': 'जांच हो रही है…',
    'report_check_notice': 'सबमिट करने से पहले रिपोर्ट को प्रोजेक्ट शेड्यूल से जांचा जाएगा।',
    'report_edited_notice': 'रिपोर्ट में बदलाव किया गया — पुनः जांचें',
    'context': 'संदर्भ (Context)',
    'context_sub': 'इस रिपोर्ट के साथ भेजा गया साइट निष्पादन संदर्भ',
    'workfront': 'कार्य स्थल',
    'work_date': 'कार्य तिथि',
    'shift_label': 'पाली (Shift)',
    'change_context': 'संदर्भ बदलें',
    'done_changing_context': 'संदर्भ परिवर्तन पूरा',
    'select_workfront': 'कार्य स्थल चुनें',
    'select_discipline': 'विभाग / ट्रेड चुनें',
    'select_work_date': 'कार्य तिथि चुनें',
    'schedule_verification': 'शेड्यूल सत्यापन',
    'schedule_verification_sub': 'OIL वेल पैड 04 बेसलाइन (120 गतिविधियां) से मिलान किया गया।',
    'return_to_home': 'मुख्य पृष्ठ पर लौटें',
    'back_to_field_os': 'फील्ड ओएस पर वापस',
    'step_review_header': 'चरण 2 · NAVIS समीक्षा',
    'review_your_report': 'अपनी रिपोर्ट की समीक्षा करें',
    'confidence_label': 'सटीकता',
    'what_you_reported': 'आपने क्या रिपोर्ट किया',
    'navis_extracted': 'NAVIS द्वारा निकाला गया डेटा',
    'matched_against_schedule': 'प्रोजेक्ट शेड्यूल से मिलान किया गया',
    'you_selected': 'आपने चुना',
    'read_from_report': 'आपकी रिपोर्ट से पढ़ा गया',
    'unmatched_notice_title': 'कोई मेल खाती गतिविधि नहीं मिली',
    'unmatched_notice_sub': 'अपडेट पूरा है, लेकिन स्वचालित रूप से लिंक नहीं हो सका। सबमिट करने पर प्लानर इसे जोड़ेंगे।',
    'send_for_planner_to_place': 'प्लानर के जोड़ने हेतु भेजें',
    'send_to_planner_review': 'प्लानर समीक्षा हेतु भेजें',
    'cancel_report': 'रद्द करें',
    'update_recorded': '✓ अपडेट रिकॉर्ड हुआ',
    'sent_for_planner_review': 'प्लानर समीक्षा हेतु भेजा गया',
    'schedule_not_changed_yet': 'प्रोजेक्ट शेड्यूल में अभी कोई बदलाव नहीं हुआ है। प्लानिंग इंजीनियर की पुष्टि के बाद ही डेटा दर्ज होगा।',
    'submit_another_report': 'एक और रिपोर्ट भेजें',
    'activity_label': 'गतिविधि (Activity)',
    'submit_for_planner_review': 'प्लानर समीक्षा हेतु सबमिट करें',
    'submission_target': 'सबमिशन लक्ष्य',
    'ready_to_dispatch': 'भेजने के लिए तैयार',
    'assigned_workfront': 'आवंटित कार्य स्थल',
    'routing_queue': 'रूटिंग कतार',
    'planning_recon_queue': 'प्लानिंग मिलान कतार',
    'target_schedule_baseline': 'लक्षित शेड्यूल बेसलाइन',
    'baseline_protection': 'बेसलाइन सुरक्षा',
    'baseline_protection_sub': 'नियोजित तारीखें अपने आप नहीं बदलेंगी। मिलान से पहले प्लानिंग टीम इसकी पुष्टि करती है।',
    'non_destructive_reporting': 'सुरक्षित फील्ड रिपोर्टिंग',
    'edit_report': '← बदलाव करें',
    'attachments_title': 'संलग्न फाइलें',
    'no_attachments': 'इस रिपोर्ट में कोई फाइल संलग्न नहीं है।',
    'choose_one': 'एक चुनें:',
    'missing_detail_placeholder': 'अनुपलब्ध विवरण टाइप करें…',
    'send_btn': 'भेजें',
    'details_needed_title': 'कुछ अतिरिक्त जानकारी आवश्यक है',
    'invalid_report_title': 'यह साइट रिपोर्ट जैसी नहीं लगती',
    'examples_title': 'रिपोर्ट के उदाहरण',

    // Common
    'project': 'प्रोजेक्ट',
    'discipline': 'विभाग / ट्रेड',
    'work_front': 'कार्य स्थल',
    'shift': 'पाली (Shift)',
    'data_date': 'डेटा तिथि',
  },

  'as-IN': {
    // Shell & Navigation
    'app_name': 'NAVIS ফিল্ড',
    'app_sub': 'ছাইট কেপচাৰ অ’এছ',
    'operations': 'কাৰ্যকলাপ',
    'nav_home': 'হোম',
    'nav_updates': 'মোৰ আপডেট',
    'nav_clarifications': 'স্পষ্টীকৰণ',
    'nav_preferences': 'পছন্দসমূহ',
    'light_mode': 'লাইট মোড',
    'dark_mode': 'ডাৰ্ক মোড',
    'switch_role': 'ভূমিকা সলনি কৰক',
    'ask_navis': 'NAVIS ক সোধক',
    'online': 'অনলাইন',
    'offline': 'অফলাইন — স্বয়ংক্ৰিয় সংমিশ্ৰণ',
    'offline_desc': 'অফলাইন মোড সক্ৰিয়। আপডেটসমূহ ডিভাইচত সুৰক্ষিত থাকিব আৰু ছিগনেল পোৱাৰ পিছত সংমিশ্ৰিত হ’ব।',

    // Field Home (Idle Stage)
    'home_title': 'আজি ছাইটত কি কাম হ’ল?',
    'home_subtitle': 'কামৰ অগ্ৰগতি, সামগ্ৰী আগমন, ছাইটৰ বাধা আৰু পৰিদৰ্শন ৰেকৰ্ড কৰক।',
    'composer_placeholder': "NAVIS ক কওক ছাইটত কি হ’ল... বা টাইপ কৰক (যেনে 'পেড-০৪ ত ৰাফ্ট কংক্ৰিটিং ৪০ m3' বা 'বৰষুণৰ বাবে দেৰি')",
    'record_voice': 'কণ্ঠ ৰেকৰ্ড কৰক',
    'photo': 'ফটো',
    'attach': 'সংলগ্ন কৰক',
    'send_update': 'আপডেট প্ৰেৰণ কৰক',
    'quick_presets': 'দ্ৰুত প্ৰিছেট',
    'prefills_format': 'স্বয়ংক্রিয় বিন্যাস',
    'preset_progress': 'কামৰ অগ্ৰগতি',
    'preset_progress_sub': 'ইৰেকশ্যন আৰু ফিট-আপ',
    'preset_material': 'সামগ্ৰী ডেলিভাৰী',
    'preset_material_sub': 'স্পুল আৰু ভাল্ভ',
    'preset_delay': 'দেৰি / প্ৰতিবন্ধকতা',
    'preset_delay_sub': 'বতৰ আৰু যাতায়াত',
    'preset_inspection': 'পৰিদৰ্শন',
    'preset_inspection_sub': 'হাইড্ৰ’টেষ্ট আৰু এনডিটি',

    // Clarifications / Planning Requests
    'req_from_planning': 'পৰিকল্পনা বিভাগৰ অনুৰোধ',
    'no_requests': '✓ কোনো অনুৰোধ নাই',
    'no_requests_sub': 'সকলো ঠিক আছে · পৰিকল্পনাকাৰীৰ প্ৰশ্ন ইয়াত দেখা যাব',
    'require_response': 'উত্তৰৰ প্ৰয়োজন',
    'answered': 'উত্তৰ দিয়া হৈছে',
    'needs_response': 'উত্তৰৰ প্ৰয়োজন',
    'all': 'সকলো',
    'respond': 'উত্তৰ দিয়ক',
    'send_response': 'উত্তৰ প্ৰেৰণ কৰক',
    'cancel': 'বাতিল কৰক',

    // Context & Shift
    'current_context': 'বৰ্তমান প্ৰসংগ',
    'change': 'সলনি কৰক',
    'done': 'হ’ল',
    'day_shift': 'দিনৰ শ্বিফ্ট (০৬:০০ - ১৮:০০)',
    'night_shift': 'ৰাতিৰ শ্বিফ্ট (১৮:০০ - ০৬:০০)',
    'recent_updates': 'শেহতীয়া আপডেট',
    'needs_your_response': 'আপোনাৰ সঁহাৰি প্ৰয়োজনীয়',

    // Voice Recording Stages
    'listening': 'শুনি আছো...',
    'listening_hint': 'অসমীয়া, হিন্দী বা ইংৰাজীত স্বাভাৱিকভাৱে কওক...',
    'stop_review': 'ৰখাওক আৰু পৰীক্ষা কৰক',

    // Preferences Page
    'pref_title': 'পছন্দসমূহ',
    'pref_sub': 'আপোনাৰ সুবিধা অনুসৰি NAVIS সজাই তোলক।',
    'pref_theme': 'ৰূপ আৰু থিম',
    'pref_theme_sub': 'আপোনাৰ ইণ্টাৰফেচ থিম বাছক। আপডেট লগে লগে প্ৰযোজ্য হয়।',
    'pref_lang': 'ভাষা আৰু কণ্ঠ ইনপুট',
    'pref_lang_sub': 'কণ্ঠ বাৰ্তা আৰু পাঠ্য প্ৰবিষ্টিৰ বাবে ভাষা সংৰূপণ কৰক।',
    'pref_lang_note': 'কণ্ঠ স্বীকৃতি সম্পূৰ্ণৰূপে ব্ৰাউজাৰত চলে। কোনো তথ্য বাহিৰলৈ প্ৰেৰণ কৰা নহয়।',
    'pref_assignment': 'বৰ্তমান দায়িত্ব',
    'read_only': 'কেৱল পঢ়িবলৈ',
    'back_home': 'হোমলৈ ঘূৰি যাওক',
    'return_role': 'ভূমিকা নিৰ্বাচনলৈ ঘূৰি যাওক',

    // Clarifications Drawer & Work Queue
    'search_clarifications': 'স্পষ্টীকৰণ সন্ধান কৰক...',
    'respond_to_planning': 'পৰিকল্পনা বিভাগক উত্তৰ দিয়ক',
    'original_field_report': 'মূল ফিল্ড ৰিপ’ৰ্ট',
    'your_response': 'আপোনাৰ উত্তৰ',
    'record_voice_resp': 'কণ্ঠেৰে উত্তৰ ৰেকৰ্ড কৰক',
    'response_sent': 'পৰিকল্পনা অভিযন্তাক উত্তৰ প্ৰেৰণ কৰা হ’ল',

    // Conversation Stage
    'data_entry_session': 'তথ্য প্ৰবিষ্টি সত্ৰ',
    'close': 'বন্ধ কৰক',
    'supervisor': 'তত্ত্বাৱধায়ক',
    'navis_assistant': 'NAVIS সহায়ক',
    'assistant_thinking': 'NAVIS সহায়কে ভাবি আছে…',
    'ready_to_draft': 'খচৰা প্ৰস্তুত কৰিবলৈ সাজু',
    'have_enough': 'মোৰ ওচৰত আপডেট প্ৰস্তুত কৰিবলৈ পৰ্যাপ্ত তথ্য আছে।',
    'review_structured_update': 'গাঁথনিগত আপডেট পৰ্যালোচনা কৰক',
    'extracted_data_msg': 'বুজি পালোঁ। মই আপোনাৰ আপডেটৰ পৰা গাঁথনিগত তথ্য সংগ্ৰহ কৰিছোঁ। অনুগ্ৰহ কৰি তলত পৰীক্ষা কৰক।',
    'answer_by_voice': 'কণ্ঠেৰে উত্তৰ দিয়ক',
    'type_update_placeholder': 'বা আপোনাৰ আপডেট টাইপ কৰক',
    'type_update_prompt': 'আপোনাৰ আপডেট টাইপ কৰক',
    'today': 'আজি',
    'yesterday': 'কালি',

    // Chips & Fields
    'chip_activity': 'কাৰ্যসূচী',
    'chip_discipline': 'ট্ৰেড/বিভাগ',
    'chip_location': 'স্থান',
    'chip_status': 'স্থিতি',
    'chip_date': 'তাৰিখ',
    'chip_quantity': 'পৰিমাণ',

    // Structured Card
    'structured_update': 'গাঁথনিগত আপডেট',
    'confidence': 'নিখুঁততা (Confidence)',
    'strong_match': 'দৃঢ় মিল',
    'planner_confirms': 'পৰিকল্পনাকাৰীয়ে নিশ্চিত কৰিব',
    'confirm_submit': 'নিশ্চিত কৰি প্ৰেৰণ কৰক',
    'submitting': 'প্ৰেৰণ কৰি থকা হৈছে…',
    'qty_over_planned_warn': 'সম্পূৰ্ণ পৰিমাণ পৰিকল্পিততকৈ বেছি — পৰিকল্পনা অভিযন্তাই পৰীক্ষা কৰিব',
    'submit_disclaimer': 'দাখিল কৰিলে কেৱল তথ্য সংৰক্ষণ হয়। পৰিকল্পনা অভিযন্তাৰ পৰ্যালোচনাৰ পিছতহে প্ৰকল্পৰ তথ্য সলনি হ’ব।',
    'not_stated': 'উল্লেখ নাই',

    // Submitted Stage
    'update_captured': '✓ আপডেট সংগ্ৰহ কৰা হ’ল',
    'update_submitted_title': 'আপডেট দাখিল কৰা হ’ল',
    'sent_for_review': 'পৰিকল্পনা অভিযন্তাৰ পৰ্যালোচনাৰ বাবে প্ৰেৰণ কৰা হ’ল।',
    'schedule_unchanged': 'প্ৰকল্পৰ সময়সূচী সলনি কৰা হোৱা নাই।',
    'extraction_summary': 'NAVIS নিষ্কাশন সাৰাংশ',
    'verified': 'সত্যাপন কৰা হ’ল',
    'work_activity': 'কাম / কাৰ্যসূচী',
    'equipment_tag': 'সঁজুলি / টেগ',
    'report_reference': 'ৰিপ’ৰ্টৰ প্ৰসংগ',
    'ready_for_review': 'পিএম পৰ্যালোচনাৰ বাবে প্ৰস্তুত',
    'submit_another': 'আন এটা আপডেট দাখিল কৰক',
    'view_in_my_updates': 'মোৰ আপডেটত চাওক',

    // Listening & Transcript
    'recording': 'ৰেকৰ্ডিং',
    'tap_to_finish': 'সম্পূৰ্ণ কৰিবলৈ টেপ কৰক',
    'speak_now_hint': 'কওক… ছাইট আপডেট ডিক্টেট কৰা হৈছে',
    'still_listening': 'শুনি থকা হৈছে…',
    'check_transcript_title': 'আপোনাৰ প্ৰতিলিপি পৰীক্ষা কৰক',
    'check_transcript_desc': 'প্ৰেৰণ কৰাৰ আগতে পৰীক্ষা কৰক — কণ্ঠ স্বীকৃতিয়ে সঁজুলিৰ নম্বৰ ভুলকৈ শুনিব পাৰে।',
    'submit_update': 'আপডেট দাখিল কৰক',
    'redo': 'পুনৰ কৰক',

    // Fallbacks
    'mic_unavailable_title': 'মাইক্ৰ’ফ’ন উপলব্ধ নহয়',
    'mic_unavailable_desc': 'মাইক্ৰ’ফ’নৰ অনুমতি দিয়া হোৱা নাই। আপুনি তলত টাইপ কৰিব পাৰে।',
    'not_understood_title': 'কণ্ঠ বুজি পোৱা নগ’ল',
    'not_understood_desc': 'মাইক্ৰ’ফ’নে স্পষ্ট শব্দ ধৰিব নোৱাৰিলে। অনুগ্ৰহ কৰি ওচৰৰ পৰা কওক বা টাইপ কৰক।',
    'server_unreachable_title': 'চাৰ্ভাৰৰ সৈতে সংযোগ হোৱা নাই',

    // Field Reports / My Updates
    'my_updates_title': 'মোৰ আপডেটসমূহ',
    'my_updates_sub': 'দাখিল কৰা ছাইট আপডেটসমূহ আৰু পৰ্যালোচনাৰ স্থিতি অনুসৰণ কৰক।',
    'filter_processing': 'প্ৰক্ৰিয়াধীন',
    'filter_confirmed': 'নিশ্চিত কৰা হৈছে',
    'filter_rejected': 'প্ৰত্যাখ্যান কৰা হৈছে',
    'no_reports_yet': 'এতিয়ালৈকে কোনো প্ৰতিবেদন নাই',
    'reports_appear_here': 'আপোনাৰ দাখিল কৰা আপডেটসমূহ ইয়াত দেখা যাব।',

    // Report Studio / Submission Flow
    'report_progress': 'কাৰ্য প্ৰগতি প্ৰতিবেদন',
    'capture': 'বিৱৰণ অন্তৰ্ভুক্ত কৰক',
    'review': 'পৰ্যালোচনা',
    'submit': 'দাখিল কৰক',
    'what_happened': 'ছাইটত কি কাম হ’ল?',
    'what_happened_sub': 'সম্পূৰ্ণ হোৱা কাম, লাইন বা স্পুল নম্বৰ, পৰিমাণ বা ছাইটৰ অৱস্থা বৰ্ণনা কৰক।',
    'report_placeholder': "ছাইটৰ প্ৰগতি বৰ্ণনা কৰক (যেনে 'P1 ৰেকত P-101ৰ ওচৰত 40 মিটাৰ 8-ইঞ্চি পাইপিং স্থাপন, হাইড্ৰ'টেষ্ট সম্পন্ন')...",
    'voice': 'কণ্ঠস্বৰ',
    'stop_recording': 'ৰেকৰ্ডিং বন্ধ কৰক',
    'photos': 'ফটো',
    'documents': 'নথিপত্ৰ',
    'report_details': 'প্ৰতিবেদনৰ বিৱৰণ',
    'report_details_sub': 'স্বয়ংক্ৰিয় সময়সূচী সংযোগৰ বাবে গঠিত পেৰামিটাৰ',
    'optional': 'ঐচ্ছিক',
    'quantity': 'পৰিমাণ (Quantity)',
    'unit': 'একক (Unit)',
    'unit_placeholder': 'মিটাৰ, স্পুল, সংখ্যা, ঘন মিটাৰ',
    'status': 'স্থিতি (Status)',
    'status_in_progress': 'চলি আছে (In Progress)',
    'status_completed': 'সম্পূৰ্ণ হ’ল (Completed)',
    'status_delayed': 'বিলম্বিত (Delayed)',
    'status_under_inspection': 'পৰিদৰ্শনত আছে (Under Inspection)',
    'equipment_tag_label': 'সঁজুলি / টেগ',
    'equipment_tag_placeholder': 'P-101, SP-04...',
    'delay_constraint': 'বিলম্ব / বাধা',
    'delay_constraint_placeholder': 'একো নাই (বা বতৰৰ বিলম্ব, অনুমতি স্থগিত, সামগ্ৰীৰ নাটনি লিখক)',
    'checking_report': 'আপোনাৰ প্ৰতিবেদন পৰীক্ষা কৰা হৈছে',
    'checking_report_sub': 'সময়সূচীৰ সৈতে পৰীক্ষা কৰি থকা হৈছে। এতিয়ালৈকে একো সংৰক্ষণ কৰা হোৱা নাই।',
    'check_report': 'প্ৰতিবেদন পৰীক্ষা কৰক →',
    'check_again': 'পুনৰ পৰীক্ষা কৰক',
    'checking': 'পৰীক্ষা চলিছে…',
    'report_check_notice': 'দাখিল কৰাৰ আগতে প্ৰতিবেদনখন প্ৰকল্পৰ সময়সূচীৰ সৈতে পৰীক্ষা কৰা হ’ব।',
    'report_edited_notice': 'প্ৰতিবেদন সম্পাদনা কৰা হৈছে — পুনৰ পৰীক্ষা কৰক',
    'context': 'প্ৰসংগ (Context)',
    'context_sub': 'এই প্ৰতিবেদনৰ সৈতে প্ৰেৰণ কৰা ছাইট কাৰ্যকৰীকৰণ প্ৰসংগ',
    'workfront': 'কাৰ্যক্ষেত্ৰ',
    'work_date': 'কাৰ্যৰ তাৰিখ',
    'shift_label': 'শ্বিফ্ট (Shift)',
    'change_context': 'প্ৰসংগ সলনি কৰক',
    'done_changing_context': 'প্ৰসংগ সলনি সম্পূৰ্ণ',
    'select_workfront': 'কাৰ্যক্ষেত্ৰ বাছক',
    'select_discipline': 'বিভাগ / ট্ৰেড বাছক',
    'select_work_date': 'কাৰ্যৰ তাৰিখ বাছক',
    'schedule_verification': 'সময়সূচী সত্যাपन',
    'schedule_verification_sub': 'OIL ৱেল পেড 04 বেচলাইন (120 কাৰ্যকলাপ)ৰ সৈতে মিলোৱা হৈছে।',
    'return_to_home': 'ঘৰলৈ উভতি যাওক',
    'back_to_field_os': 'ফিল্ড অ’এছলৈ উভতি যাওক',
    'step_review_header': 'পদক্ষেপ ২ · NAVIS পৰ্যালোচনা',
    'review_your_report': 'আপোনাৰ প্ৰতিবেদন পৰ্যালোচনা কৰক',
    'confidence_label': 'সঠিকতা',
    'what_you_reported': 'আপুনি কি প্ৰতিবেদন দিলে',
    'navis_extracted': 'NAVIS দ্বাৰা উলিওৱা তথ্য',
    'matched_against_schedule': 'প্ৰকল্পৰ সময়সূচীৰ সৈতে মিলোৱা হৈছে',
    'you_selected': 'আপুনি বাছনি কৰিলে',
    'read_from_report': 'আপোনাৰ প্ৰতিবেদনৰ পৰা পঢ়া হ’ল',
    'unmatched_notice_title': 'কোনো মিলি যোৱা কাৰ্যসূচী পোৱা নগ’ল',
    'unmatched_notice_sub': 'আপডেট সম্পূৰ্ণ, কিন্তু স্বয়ংক্ৰিয়ভাৱে সংযোগ কৰিব নোৱাৰি। দাখিল কৰিলে প্লেনাৰে ইয়াক স্থান দিব।',
    'send_for_planner_to_place': 'প্লেনাৰৰ সংযোগৰ বাবে প্ৰেৰণ কৰক',
    'send_to_planner_review': 'প্লেনাৰ পৰ্যালোচনাৰ বাবে প্ৰেৰণ কৰক',
    'cancel_report': 'বাতিল কৰক',
    'update_recorded': '✓ আপডেট নথিভুক্ত হ’ল',
    'sent_for_planner_review': 'প্লেনাৰ পৰ্যালোচনাৰ বাবে প্ৰেৰণ কৰা হৈছে',
    'schedule_not_changed_yet': 'প্ৰকল্পৰ সময়সূচীত এতিয়াও কোনো সালসলনি হোৱা নাই। প্লেনিং অভিযন্তাই নিশ্চিত কৰাৰ পিছতহে তথ্য যোগ হ’ব।',
    'submit_another_report': 'আন এটা প্ৰতিবেদন প্ৰেৰণ কৰক',
    'activity_label': 'কাৰ্যসূচী (Activity)',
    'submit_for_planner_review': 'প্লেনাৰ পৰ্যালোচনাৰ বাবে দাখিল কৰক',
    'submission_target': 'দাখিলৰ লক্ষ্য',
    'ready_to_dispatch': 'প্ৰেৰণৰ বাবে সাজু',
    'assigned_workfront': 'নিৰ্ধাৰিত কাৰ্যক্ষেত্ৰ',
    'routing_queue': 'ৰুটিং শাৰী',
    'planning_recon_queue': 'পৰিকল্পনা সংমিশ্ৰণ শাৰী',
    'target_schedule_baseline': 'লক্ষ্য সময়সূচী বেচলাইন',
    'baseline_protection': 'বেচলাইন সুৰক্ষা',
    'baseline_protection_sub': 'পৰিকল্পিত তাৰিখ স্বয়ংক্ৰিয়ভাৱে সলনি নহ’ব। সংমিশ্ৰণৰ আগতে পৰিকল্পনা দলে ইয়াক নিশ্চিত কৰিব।',
    'non_destructive_reporting': 'সুৰক্ষিত ফিল্ড ৰিপৰ্টিং',
    'edit_report': '← সম্পাদনা',
    'attachments_title': 'সংলগ্ন নথিপত্ৰ',
    'no_attachments': 'এই প্ৰতিবেদনত কোনো সংলগ্ন নথিপত্ৰ নাই।',
    'choose_one': 'এটা বাছনি কৰক:',
    'missing_detail_placeholder': 'অনুপস্থিত তথ্য টাইপ কৰক…',
    'send_btn': 'প্ৰেৰণ কৰক',
    'details_needed_title': 'কিছু অতিৰিক্ত তথ্যৰ প্ৰয়োজন',
    'invalid_report_title': 'এইটো ছাইট প্ৰতিবেদন যেন লগা নাই',
    'examples_title': 'প্ৰতিবেদনৰ উদাহৰণ',

    // Common
    'project': 'প্ৰকল্প',
    'discipline': 'ট্ৰেড / বিভাগ',
    'work_front': 'কাৰ্যক্ষেত্ৰ',
    'shift': 'শ্বিফ্ট (Shift)',
    'data_date': 'তথ্যৰ তাৰিখ',
  },
};

const listeners = new Set<(lang: LanguageCode) => void>();

export function getActiveLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en-IN';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) as LanguageCode;
    if (v && v in TRANSLATIONS) return v;
  } catch {
    // fallback to default
  }
  return 'en-IN';
}

export function setActiveLanguage(lang: LanguageCode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable
  }
  listeners.forEach((fn) => fn(lang));
}

export function translate(key: string, fallback?: string): string {
  const lang = getActiveLanguage();
  return TRANSLATIONS[lang]?.[key] ?? fallback ?? key;
}

const DYNAMIC_PATTERNS: Record<LanguageCode, [RegExp, string][]> = {
  'en-IN': [],
  'hi-IN': [
    [/Which date did this progress happen on\?/i, 'यह प्रगति किस तारीख को हुई?'],
    [/Which date was it completed\?/i, 'यह किस तारीख को पूरा हुआ?'],
    [/Which date did this delay occur on\?/i, 'यह देरी किस तारीख को हुई?'],
    [/As of which date is it not started\?/i, 'यह किस तारीख तक शुरू नहीं हुआ?'],
    [/What is the status of this work\?/i, 'इस कार्य की स्थिति क्या है?'],
    [/Which discipline does this work belong to\?/i, 'यह कार्य किस ट्रेड/विभाग से संबंधित है?'],
    [/Where is this work happening\?/i, 'यह कार्य कहाँ हो रहा है?'],
    [/How many spools out of the planned quantity\?/i, 'नियोजित मात्रा में से कितने स्पूल?'],
    [/How many (.*) out of the planned quantity\?/i, 'नियोजित मात्रा में से कितने $1?'],
    [/How many were planned in total\?/i, 'कुल कितने नियोजित थे?'],
    [/I have enough to prepare the update\./i, 'मेरे पास अपडेट तैयार करने के लिए पर्याप्त जानकारी है।'],
    [/I need one more thing before I can send this\./i, 'भेजने से पहले मुझे एक और जानकारी चाहिए।'],
    [/Which activity is this\? Describe it again in your own words\./i, 'यह कौन सी गतिविधि है? कृपया इसे अपने शब्दों में पुनः बताएं।'],
    [/What is the correct status\?/i, 'सही स्थिति क्या है?'],
    [/What is the correct date\?/i, 'सही तारीख क्या है?'],
    [/What is the correct quantity\?/i, 'सही मात्रा क्या है?'],
  ],
  'as-IN': [
    [/Which date did this progress happen on\?/i, 'এই অগ্ৰগতি কোন তাৰিখে হৈছিল?'],
    [/Which date was it completed\?/i, 'এইটো কোন তাৰিখে সম্পূৰ্ণ হ’ল?'],
    [/Which date did this delay occur on\?/i, 'এই দেৰি কোন তাৰিখে হৈছিল?'],
    [/As of which date is it not started\?/i, 'কোন তাৰিখলৈকে আৰম্ভ হোৱা নাই?'],
    [/What is the status of this work\?/i, 'এই কামৰ স্থিতি কি?'],
    [/Which discipline does this work belong to\?/i, 'এই কামটো কোন বিভাগৰ অন্তৰ্ভুক্ত?'],
    [/Where is this work happening\?/i, 'এই কাম ক’ত হৈছে?'],
    [/How many spools out of the planned quantity\?/i, 'পৰিকল্পিত পৰিমাণৰ কিমান স্পুল?'],
    [/How many (.*) out of the planned quantity\?/i, 'পৰিকল্পিত পৰিমাণৰ কিমান $1?'],
    [/How many were planned in total\?/i, 'মুঠ কিমান পৰিকল্পনা কৰা হৈছিল?'],
    [/I have enough to prepare the update\./i, 'মোৰ ওচৰত আপডেট প্ৰস্তুত কৰিবলৈ পৰ্যাপ্ত তথ্য আছে।'],
    [/I need one more thing before I can send this\./i, 'প্ৰেৰণ কৰাৰ আগতে মোক আৰু এটা তথ্য লাগে।'],
    [/Which activity is this\? Describe it again in your own words\./i, 'এইটো কি কাৰ্যসূচী? নিজৰ ভাষাত পুনৰ বৰ্ণনা কৰক।'],
    [/What is the correct status\?/i, 'সঠিক স্থিতি কি?'],
    [/What is the correct date\?/i, 'সঠিক তাৰিখ কি?'],
    [/What is the correct quantity\?/i, 'সঠিক পৰিমাণ কি?'],
  ],
};

export function translateDynamicText(text: string | null | undefined, lang?: LanguageCode): string {
  if (!text) return '';
  const active = lang ?? getActiveLanguage();
  if (active === 'en-IN') return text;
  const patterns = DYNAMIC_PATTERNS[active];
  if (patterns) {
    for (const [regex, repl] of patterns) {
      if (regex.test(text)) {
        return text.replace(regex, repl);
      }
    }
  }
  return text;
}

export function translateSuggestion(sug: string, lang?: LanguageCode): string {
  const active = lang ?? getActiveLanguage();
  if (active === 'en-IN') return sug;
  const map: Record<string, Record<LanguageCode, string>> = {
    'Today': { 'en-IN': 'Today', 'hi-IN': 'आज', 'as-IN': 'আজি' },
    'Yesterday': { 'en-IN': 'Yesterday', 'hi-IN': 'कल', 'as-IN': 'কালি' },
    'Finished': { 'en-IN': 'Finished', 'hi-IN': 'समाप्त (Finished)', 'as-IN': 'সম্পূৰ্ণ (Finished)' },
    'In progress': { 'en-IN': 'In progress', 'hi-IN': 'प्रगति पर (In progress)', 'as-IN': 'চলি আছে (In progress)' },
    'Delayed': { 'en-IN': 'Delayed', 'hi-IN': 'देरी (Delayed)', 'as-IN': 'বিলম্বিত (Delayed)' },
    'Blocked': { 'en-IN': 'Blocked', 'hi-IN': 'बाधित (Blocked)', 'as-IN': 'বাধাগ্রস্ত (Blocked)' },
    'Not started': { 'en-IN': 'Not started', 'hi-IN': 'शुरू नहीं हुआ (Not started)', 'as-IN': 'আৰম্ভ হোৱা নাই (Not started)' },
    'Civil': { 'en-IN': 'Civil', 'hi-IN': 'सिविल (Civil)', 'as-IN': 'চিভিল (Civil)' },
    'Piping': { 'en-IN': 'Piping', 'hi-IN': 'पाइपिंग (Piping)', 'as-IN': 'পাইপিং (Piping)' },
    'Electrical': { 'en-IN': 'Electrical', 'hi-IN': 'इलेक्ट्रिकल (Electrical)', 'as-IN': 'বৈদ্যুতিক (Electrical)' },
    'Instrumentation': { 'en-IN': 'Instrumentation', 'hi-IN': 'इंस्ट्रुमेंटेशन (Instrumentation)', 'as-IN': 'যন্ত্রপাতি (Instrumentation)' },
    'Static Equipment': { 'en-IN': 'Static Equipment', 'hi-IN': 'स्टैटिक उपकरण', 'as-IN': 'স্থিৰ সঁজুলি' },
    'HSE': { 'en-IN': 'HSE', 'hi-IN': 'एचएसई (HSE)', 'as-IN': 'এইচএছই (HSE)' },
  };
  return map[sug]?.[active] ?? sug;
}

export function translateValue(val: string, lang?: LanguageCode): string {
  const active = lang ?? getActiveLanguage();
  if (active === 'en-IN' || !val) return val;
  const map: Record<string, Record<LanguageCode, string>> = {
    'In progress': { 'en-IN': 'In progress', 'hi-IN': 'प्रगति पर', 'as-IN': 'চলি আছে' },
    'Finished': { 'en-IN': 'Finished', 'hi-IN': 'समाप्त', 'as-IN': 'সম্পূৰ্ণ' },
    'Delayed': { 'en-IN': 'Delayed', 'hi-IN': 'विलंबित', 'as-IN': 'বিলম্বিত' },
    'Blocked': { 'en-IN': 'Blocked', 'hi-IN': 'अवरुद्ध', 'as-IN': 'বাধাগ্রস্ত' },
    'Not started': { 'en-IN': 'Not started', 'hi-IN': 'शुरू नहीं हुआ', 'as-IN': 'আৰম্ভ হোৱা নাই' },
    'Piping': { 'en-IN': 'Piping', 'hi-IN': 'पाइपिंग', 'as-IN': 'পাইপিং' },
    'Civil': { 'en-IN': 'Civil', 'hi-IN': 'सिविल', 'as-IN': 'চিভিল' },
    'Electrical': { 'en-IN': 'Electrical', 'hi-IN': 'इलेक्ट्रिकल', 'as-IN': 'বৈদ্যুতিক' },
    'Instrumentation': { 'en-IN': 'Instrumentation', 'hi-IN': 'इंस्ट्रुमेंटेशन', 'as-IN': 'যন্ত্রপাতি' },
    'Static Equipment': { 'en-IN': 'Static Equipment', 'hi-IN': 'स्टैटिक उपकरण', 'as-IN': 'স্থিৰ সঁজুলি' },
    'HSE': { 'en-IN': 'HSE', 'hi-IN': 'एचएसई', 'as-IN': 'এইচএছই' },
  };
  return map[val]?.[active] ?? val;
}

export function useTranslation() {
  const [currentLang, setCurrentLang] = useState<LanguageCode>(() => getActiveLanguage());

  useEffect(() => {
    const handler = (l: LanguageCode) => setCurrentLang(l);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const t = (key: string, fallback?: string): string => {
    return TRANSLATIONS[currentLang]?.[key] ?? fallback ?? key;
  };

  const changeLang = (l: LanguageCode) => {
    setActiveLanguage(l);
  };

  return {
    t,
    tDynamic: (txt: string | null | undefined) => translateDynamicText(txt, currentLang),
    tSug: (sug: string) => translateSuggestion(sug, currentLang),
    tVal: (val: string) => translateValue(val, currentLang),
    lang: currentLang,
    setLang: changeLang,
    languages: LANGUAGES,
  };
}
