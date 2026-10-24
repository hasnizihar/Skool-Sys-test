# KCC SkoolSys 2.0 — School Data Collection Templates

**Project:** Kattankudy Central College — SkoolSys 2.0  
**Purpose:** Data preparation guide and CSV formatting templates for onboarding school records prior to pilot activation.  
**Strict Guideline:** Do NOT input real student records into the development environment. Use these templates to prepare clean school data for the future authorized pilot.

---

## 1. Overview of Required Data Sets

To initialize SkoolSys 2.0 for live operations, five data sets must be collected from the school administration:
1. **Academic Classes & Streams**
2. **Faculty & Staff Roster**
3. **Subject Catalog & Offerings**
4. **Student Admission & Guardian Records**
5. **Class Teacher & Subject Allocations**

---

## 2. Template 1: Student Admission Records (`students.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description / Format Rules | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `admission_no` | Text | **Yes** | Unique school admission identifier. | `SCH-2024-001` |
| `full_name` | Text | **Yes** | Full official name as registered on birth certificate. | `Kasun Malinda Ranasinghe` |
| `calling_name` | Text | **Yes** | Preferred everyday name used in class register. | `Kasun` |
| `dob` | Date | **Yes** | Date of birth in `YYYY-MM-DD` format. | `2012-03-14` |
| `gender` | Text | **Yes** | `Male` or `Female`. | `Male` |
| `address` | Text | **Yes** | Residential address. | `No 45, Temple Road, Colombo 05` |
| `guardian_name` | Text | **Yes** | Full name of primary parent or legal guardian. | `Sunil Ranasinghe` |
| `guardian_relation` | Text | **Yes** | Relationship: `Father`, `Mother`, `Guardian`. | `Father` |
| `guardian_phone` | Text | **Yes** | Primary Sri Lankan mobile phone (`07XXXXXXXX` or `+947XXXXXXXX`). | `0771234567` |
| `guardian_email` | Text | No | Email address for digital correspondence. | `parent@example.com` |
| `emergency_contact`| Text | **Yes** | Secondary emergency phone number. | `0712345678` |
| `enrolled_class` | Text | **Yes** | Target class allocation. | `Grade 8-A` |

### Raw CSV Sample
```csv
admission_no,full_name,calling_name,dob,gender,address,guardian_name,guardian_relation,guardian_phone,guardian_email,emergency_contact,enrolled_class
SCH-2024-001,Kasun Malinda Ranasinghe,Kasun,2012-03-14,Male,"No 45, Temple Road, Colombo 05",Sunil Ranasinghe,Father,0771234567,sunil@example.com,0771234567,Grade 8-A
SCH-2024-002,Tharushi Nilakshi Fernando,Tharushi,2012-05-22,Female,"No 12/A, Station Lane, Dehiwala",Kamal Fernando,Father,0712345678,kamal@example.com,0712345678,Grade 8-A
```

---

## 3. Template 2: Faculty & Staff Roster (`teachers.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description / Format Rules | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `full_name` | Text | **Yes** | Full official name including initials. | `Mrs. Nimali Perera` |
| `username` | Text | **Yes** | Unique system login username (lowercase, underscores). | `teacher_nimali` |
| `email` | Text | **Yes** | Official school email address. | `nimali.perera@skoolsys.edu` |
| `role` | Text | **Yes** | System role: `admin`, `class_teacher`, or `subject_teacher`. | `class_teacher` |
| `designation` | Text | **Yes** | Official school title (e.g., Section Head, Master of Mathematics). | `Teacher of English` |
| `phone` | Text | No | Mobile phone for internal communications. | `0779876543` |

### Raw CSV Sample
```csv
full_name,username,email,role,designation,phone
"Mr. A.L.M. Mukthar",admin,admin@skoolsys.edu,admin,"Principal / Administrative Head",0771112222
"Mr. M.I.M. Nawas",vp_academic,vp.academic@skoolsys.edu,class_teacher,"Vice Principal (Academic Affairs)",0772223333
"Mr. K.L.M. Farook",section_head_junior,sh.junior@skoolsys.edu,class_teacher,"Sectional Head (Grades 6–9)",0773334444
"Mrs. Nimali Perera",teacher_nimali,nimali.perera@skoolsys.edu,class_teacher,"Grade 8-A Class Teacher",0774445555
```

---

## 4. Template 3: Class & Section Assignments (`classes.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description / Format Rules | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `grade` | Integer | **Yes** | Grade level (6 to 13). | `8` |
| `name` | Text | **Yes** | Official class division name. | `Grade 8-A` |
| `room_number` | Text | No | Classroom or laboratory location. | `Block B - 101` |
| `class_teacher_username` | Text | No | Username of assigned homeroom class teacher. | `teacher_nimali` |

### Raw CSV Sample
```csv
grade,name,room_number,class_teacher_username
6,Grade 6-A,Block A - 101,teacher_fathima
6,Grade 6-B,Block A - 102,
7,Grade 7-A,Block A - 201,teacher_zareena
8,Grade 8-A,Block B - 101,teacher_nimali
11,Grade 11-A,Block C - 201,teacher_mansoor
12,Grade 12-Science,Science Lab 1,teacher_kamal
```

---

## 5. Template 4: Subject Catalog (`subjects.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description / Format Rules | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `code` | Text | **Yes** | Short unique subject code (uppercase). | `MATH` |
| `name` | Text | **Yes** | Full subject title. | `Mathematics` |
| `category` | Text | **Yes** | `Core`, `Religion`, `Science`, `Commerce`, `Aesthetic`. | `Core` |
| `grade_level` | Text | **Yes** | Grade range: `6-11`, `10-11`, or `12-13`. | `6-11` |

### Raw CSV Sample
```csv
code,name,category,grade_level
MATH,Mathematics,Core,6-11
SCI,Science,Core,6-11
ENG,English Language,Core,6-13
TAM,Tamil Language & Lit.,Core,6-11
COMM,Commerce & Accounting,Commerce,10-11
PHY,Physics,Science,12-13
CHEM,Chemistry,Science,12-13
CMATH,Combined Mathematics,Science,12-13
```

---

## 6. Template 5: Teacher-Subject Allocations (`allocations.csv`)

### Raw CSV Sample
```csv
teacher_username,class_name,subject_code,assignment_type
teacher_nimali,Grade 8-A,,class_teacher
teacher_samantha,Grade 8-A,MATH,subject_teacher
teacher_priya,Grade 8-A,SCI,subject_teacher
teacher_nimali,Grade 8-A,ENG,subject_teacher
teacher_mansoor,Grade 11-A,COMM,subject_teacher
teacher_kamal,Grade 12-Science,PHY,subject_teacher
```
