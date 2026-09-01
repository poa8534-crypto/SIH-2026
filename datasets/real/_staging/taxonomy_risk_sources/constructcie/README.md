---
license: apache-2.0
language:
- en
pretty_name: ConstructCIE
size_categories:
- n<1K
task_categories:
- text-generation
- text-classification
tags:
- information-extraction
- causal-extraction
- construction-safety
- accident-reports
configs:
- config_name: default
  data_files:
  - split: train
    path: constructcie.json
---

# Dataset Card for ConstructCIE

<!-- Provide a quick summary of the dataset. -->

ConstructCIE is a dataset for extracting causal information from construction accident narratives. Each accident report is annotated with a hierarchy of causal factors.

> Accepted to **Findings of the Association for Computational Linguistics: EMNLP 2026**


## Dataset Details

### Dataset Description

<!-- Provide a longer summary of what this dataset is. -->

The dataset contains 530 English construction accident narratives drawn from OSHA accident investigation summaries published between 2011 and 2023. Each narrative is annotated with a tree of causal information: **extraction** nodes carry supporting text spans and keywords, and **classification** nodes carry categorical labels (accident type, construction trade, severity).

- **Language:** English
- **License:** Apache 2.0

### Dataset Sources

<!-- Provide the basic links for the dataset. -->

- **Repository:** https://github.com/lab-flair/ConstructCIE
- **Paper:** https://arxiv.org/abs/2608.06495


## Uses

<!-- Address questions around how the dataset is intended to be used. -->

### Direct Use

<!-- This section describes suitable use cases for the dataset. -->

Benchmarking LLMs (zero-/few-shot) and supervised models on hierarchical causal information extraction from safety narratives: extracting causal factor spans, and classifying accident type, construction trade, and severity.

### Out-of-Scope Use

<!-- This section addresses misuse, malicious use, and uses that the dataset will not work well for. -->

Not intended for regulatory or compliance decisions, incident liability determination, or as an exhaustive record of construction accidents.

## Dataset Structure

<!-- This section provides a description of the dataset fields, and additional information about the dataset structure such as criteria used to create the splits, relationships between data points, etc. -->

Each record is one JSON line with three top-level fields:

- `id` — unique record id
- `accident_report` — the narrative text with its hierarchical annotation tree
- `accident_type` — classification: `caught-in/between`, `electrocution`, `fall`, or `struck-by`

Nodes in the `accident_report` tree are either **extraction** nodes (`{text, keywords, children}`) or **classification** nodes (`{value}`). Factors and their subfactors (marked ↳) are:

| Factor / Subfactor | Definition |
|--------------------|------------|
| `working_circumstances` | Physical and operational contexts present at the time of the accident that characterize the immediate work situation. |
| ↳ `construction_trade` | The primary construction activity division being performed at the time of the accident. |
| `managerial_factors` | Deficiencies at the organizational or supervisory level that allowed unsafe conditions or behaviors to exist. |
| ↳ `failure_of_hazard_management` | Failure to identify or include foreseeable hazards during pre-task planning or risk assessment. |
| ↳ `deficiency_in_safety_training` | Failure to provide adequate task-specific training enabling workers to perform tasks safely and respond to foreseeable hazards. |
| `working_condition_factors` | Physical conditions of the work environment, such as natural conditions and workspace characteristics, that contributed to the occurrence of the accident. |
| ↳ `weather_condition` | Weather-related conditions that influenced the work environment or contributed to the accident sequence. |
| ↳ `workspace_condition` | Physical conditions related to the workspace, or structural elements, including spatial arrangement, support conditions, integrity, surface characteristics, or surrounding physical layout. |
| `equipment_factors` | Conditions related to personal or collective protective equipment or work equipment whose state contributed to the accident sequence. |
| ↳ `protective_equipment_condition` | The state, functionality, availability, configuration, or appropriateness of personal or collective protective equipment. |
| ↳ `work_equipment_condition` | The functional state, physical integrity, configuration, or availability of tools, machinery, or powered/non-powered work equipment. |
| `behavioral_factors` | Task-level human factors involving cognitive lapses or procedural deviations that directly contributed to the occurrence of the accident. |
| ↳ `inattentive_behavior` | Behavior resulting from cognitive lapses such as reduced vigilance, distraction, or loss of situational awareness. |
| ↳ `noncompliant_behavior` | Behavior involving the disregard of required safety rules, safe work practices, or protective measures. |
| `consequences` | The adverse outcomes of the incident, including the seriousness of injury and the part(s) of the body affected. |
| ↳ `severity` | The degree and seriousness of injury: `fatality`, `hospitalized injury`, or `non hospitalized injury`. |
| ↳ `affected_body_part` | The part(s) of the body that sustained harm due to the incident. |
| `object_involved` | The equipment, structure, material, or object that physically interacted with or contributed to the accident mechanism. |


## Dataset Creation

### Curation Rationale

<!-- Motivation for the creation of this dataset. -->

Construction accident reports contain rich causal information locked in free text. Unlike trigger-centered event extraction, accident causality is often implicit, long-span, and distributed across multiple sentences. Structuring it as a hierarchy of causal factors enables systematic safety analysis and provides a benchmark for hierarchical causal information extraction.

### Source Data

<!-- This section describes the source data (e.g. news text and headlines, social media posts, translated sentences, ...). -->

#### Data Collection and Processing

<!-- This section describes the data collection and processing process such as data selection criteria, filtering and normalization methods, tools and libraries used, etc. -->

OSHA accident investigation summaries published between 2011 and 2023 were screened in two stages: record-level screening removed duplicates and reports unrelated to construction activities, and content-level screening retained only narratives that explicitly describe both accident circumstances and causes, yielding 530 reports. All date information was removed using regular-expression matching to prevent models from learning false temporal patterns.

#### Who are the source data producers?

<!-- This section describes the people or systems who originally created the data. It should also include self-reported demographic or identity information for the source data creators if this information is available. -->

The Occupational Safety and Health Administration (OSHA), which publishes accident investigation summaries of workplace incidents in the United States.

#### Personal and Sensitive Information

<!-- State whether the dataset contains data that might be considered personal, sensitive, or private (e.g., data that reveals addresses, uniquely identifiable names or aliases, racial or ethnic origins, sexual orientations, religious beliefs, political opinions, financial or health data, etc.). -->

Narratives describe real workplace injuries and fatalities. Workers are referred to anonymously (e.g., "Employee #1") and no names or direct identifiers appear in the text.

## Citation

<!-- If there is a paper or blog post introducing the dataset, the APA and Bibtex information for that should go in this section. -->

```bibtex
@inproceedings{nguyen2026constructcie,
      title={ConstructCIE: A Dataset for Extracting Causal Information from Construction Accident Narratives},
      author={Hung Nguyen and Jaehoon Lee and Namgyun Kim and Kuan-Hao Huang},
      booktitle={Findings of the Association for Computational Linguistics: EMNLP 2026},
      year={2026},
      note={arXiv:2608.06495},
      url={https://arxiv.org/abs/2608.06495},
}
```

