# KCC SkoolSys 2.0 — School Data Collection Templates

**Project:** Kattankudy Central College — SkoolSys 2.0  
**Institution:** Kattankudy Central College (காத்தான்குடி மத்திய கல்லூரி)  
**School Census Number:** 14145  
**Institution Type:** 1AB National School (Boys, Grades 6–13)  
**Address:** No. 322, Beach Road, New Kattankudy 06, Batticaloa District, Eastern Province, Sri Lanka  
**Purpose:** Data preparation guidelines and CSV formatting templates for onboarding institutional records prior to live pilot activation.  
**Implementation Contacts:** Amanullah and Hasni Zihar — SkoolSys Development Team (*Software developers, not appointed school personnel*)  

> [!IMPORTANT]
> **Data Protection & Privacy Notice:**  
> Do **NOT** input real student or staff personal records into development or demonstration environments. Use these templates strictly to format and clean institutional records locally within the school's authorized administrative custody. Real records will only be imported into a formally secured, production-grade deployment after leadership authorization.

---

## 1. Overview of Required Data Sets

To configure SkoolSys 2.0 for live school operations, the following data sets must be requested from school administration:

1. **Official Student Register:** Complete student enrollment list with unique admission numbers, dates of birth, guardian names, contact phone numbers, and home addresses.
2. **Approved Class & Section Structure:** Confirmed division of classes across Junior Secondary (Grades 6–9), G.C.E. O/L (Grades 10–11), and G.C.E. A/L streams (Grades 12–13 Science, Commerce, Arts, Technology).
3. **Faculty & Staff Directory:** Appointed teaching staff, administrative designations, and institutional email addresses.
4. **Teaching Allocations:** Homeroom (class teacher) assignments and subject specialist assignments per class.
5. **Curriculum & Subject Offerings:** Compulsory core subjects, religion options, aesthetic baskets, O/L elective baskets, and A/L stream subject configurations.
6. **Academic Calendar & Attendance Policies:** Term assessment dates, daily attendance cutoff times, and authorized leave categories.
7. **Assessment & Grading Policy Profiles:** Official grading boundaries (A/B/C/S/F), ranking algorithms, and moderation approval thresholds.
8. **Institutional Branding Assets:** Verified, school-controlled digital vector crest/emblem and official letterhead guidelines.

---

## 2. Template 1: Student Admission Records (`students.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description / Format Rules | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `admission_no` | Text | **Yes** | Unique school admission identifier. | `14145/2024/001` |
| `full_name` | Text | **Yes** | Full official name as registered on birth certificate. | `Mohamed Akram Ilham` |
| `calling_name` | Text | **Yes** | Everyday name used in class register. | `Akram` |
| `dob` | Date | **Yes** | Date of birth in `YYYY-MM-DD` format. | `2010-06-15` |
| `gender` | Text | **Yes** | `Male` (Consistent with MoE Boys' school classification). | `Male` |
| `address` | Text | **Yes** | Residential address in Kattankudy / Batticaloa. | `No. 45, Beach Road, New Kattankudy 06` |
| `guardian_name` | Text | **Yes** | Full name of primary parent or legal guardian. | `M. H. Mohamed Ilham` |
| `guardian_relation` | Text | **Yes** | Relationship: `Father`, `Mother`, `Guardian`. | `Father` |
| `guardian_phone` | Text | **Yes** | Primary Sri Lankan mobile phone (`07XXXXXXXX`). | `0771234567` |
| `guardian_email` | Text | No | Email address for digital notifications. | `ilham.family@example.com` |
| `emergency_contact`| Text | **Yes** | Secondary emergency telephone number. | `0712345678` |
| `enrolled_class` | Text | **Yes** | Initial class allocation. | `Grade 11-A` |

### Sample CSV Records
```csv
admission_no,full_name,calling_name,dob,gender,address,guardian_name,guardian_relation,guardian_phone,guardian_email,emergency_contact,enrolled_class
14145/2024/001,Kasun Malinda Ranasinghe,Kasun,2012-03-14,Male,"No. 12, Beach Road, New Kattankudy 06",Sunil Ranasinghe,Father,0771234567,sunil.r@example.com,0771234567,Grade 8-A
14145/2021/042,Mohamed Akram Ilham,Akram,2010-06-15,Male,"No. 45, Main Street, Kattankudy 03",M. H. Mohamed Ilham,Father,0779876543,akram.parent@example.com,0779876543,Grade 11-A
14145/2020/018,Mohamed Irfan Shakaf,Irfan,2008-09-21,Male,"No. 88, Rest House Road, Kattankudy 01",A. L. Shakaf,Father,0714567890,shakaf@example.com,0714567890,Grade 12-Science
```

---

## 3. Template 2: Faculty & Staff Roster (`teachers.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description / Format Rules | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `full_name` | Text | **Yes** | Full official name including initials. | `Mr. M. A. Mansoor` |
| `username` | Text | **Yes** | System login username (lowercase, alphanumeric). | `teacher_mansoor` |
| `email` | Text | **Yes** | Official school email address. | `mansoor.m@kcc.edu.lk` |
| `role` | Text | **Yes** | System role: `admin`, `class_teacher`, or `subject_teacher`. | `class_teacher` |
| `designation` | Text | **Yes** | Official school appointment (e.g. Master of Commerce). | `Senior Teacher of Commerce` |
| `phone` | Text | No | Mobile phone for internal communications. | `0779876543` |

### Sample CSV Records
```csv
full_name,username,email,role,designation,phone
"Mr. M.I.M. Nawas",vp_academic,vp.academic@kcc.edu.lk,class_teacher,"Vice Principal (Academic)",0771122334
"Mr. K.L.M. Farook",section_head_junior,sh.junior@kcc.edu.lk,class_teacher,"Section Head (Grades 6–9)",0772233445
"Mr. S.H.M. Jameel",section_head_senior,sh.senior@kcc.edu.lk,class_teacher,"Section Head (Grades 10–13)",0773344556
"Mrs. Nimali Perera",teacher_nimali,nimali.p@kcc.edu.lk,class_teacher,"Teacher of English",0774455667
"Mr. Samantha Silva",teacher_samantha,samantha.s@kcc.edu.lk,subject_teacher,"Master of Mathematics",0775566778
"Ms. Priyanthi Wickramasinghe",teacher_priya,priya.w@kcc.edu.lk,subject_teacher,"Teacher of Science & ICT",0776677889
"Mr. Kamal Wickremesooriya",teacher_kamal,kamal.w@kcc.edu.lk,class_teacher,"Master of Advanced Science",0777788990
```

---

## 4. Template 3: Class & Subject Allocations (`allocations.csv`)

### Schema & Data Dictionary

| Column Header | Data Type | Required | Description | Example Value |
| :--- | :--- | :---: | :--- | :--- |
| `class_name` | Text | **Yes** | Name of the class / division. | `Grade 8-A` |
| `grade` | Integer | **Yes** | Grade level (6 to 13). | `8` |
| `class_teacher_username` | Text | **Yes** | Username of appointed homeroom teacher. | `teacher_nimali` |
| `subject_code` | Text | **Yes** | Subject code from catalog. | `MATH-8` |
| `subject_teacher_username` | Text | **Yes** | Username of assigned subject specialist. | `teacher_samantha` |

### Sample CSV Records
```csv
class_name,grade,class_teacher_username,subject_code,subject_teacher_username
Grade 8-A,8,teacher_nimali,ENG-8,teacher_nimali
Grade 8-A,8,teacher_nimali,MATH-8,teacher_samantha
Grade 8-A,8,teacher_nimali,SCI-8,teacher_priya
Grade 11-A,11,teacher_mansoor,MATH-11,teacher_samantha
Grade 11-A,11,teacher_mansoor,COMM-11,teacher_mansoor
Grade 12-Science,12,teacher_kamal,PHYS-12,teacher_kamal
Grade 12-Science,12,teacher_kamal,CHEM-12,teacher_kamal
```

---

## 5. Next Steps for Pilot Onboarding

1. School administration reviews and populates the local CSV templates.
2. SkoolSys development team conducts schema validation and duplicate checking.
3. Import script executes against a dedicated, authorized staging environment.
4. School leadership inspects and signs off on initial class rosters and subject baskets before live activation.
