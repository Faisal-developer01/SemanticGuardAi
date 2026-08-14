# Candidate Assessment Page - Implementation & Testing Guide

## Summary of Changes

### 1. Backend Fix (PostgreSQL Query)
**File:** `backend/app/repositories/__init__.py`

Fixed the `QuestionRepository.for_assessment()` method to eagerly load question options and test cases using SQLAlchemy's `selectinload()`. This ensures the API response includes all necessary data for rendering different question types.

**Impact:** Questions now return complete data including:
- `options` (for multiple_choice)
- `testCases` (for coding)
- `starterCode` / `starterCodes` (for coding)
- `entryPoint` and `languages` (for coding)

### 2. Frontend Component (Question Rendering)
**File:** `src/components/candidate/QuestionRenderer.tsx` (NEW)

New reusable component that dynamically renders all question types:
- **Multiple Choice:** Radio buttons with options
- **True/False:** True/False radio buttons
- **Short Answer:** Textarea for text input
- **Coding:** Monaco Editor (JavaScript & Java only) with test cases

Features:
- Smart type inference from question data
- Proper form semantics with `<fieldset>` and `<legend>`
- Accessibility labels and ARIA attributes
- Handles edge cases (null options, missing types)

### 3. Assessment Screen Integration
**File:** `src/pages/candidate/AssessmentScreen.tsx`

Updated to use the new `QuestionRenderer` component, simplifying the question rendering logic and consolidating type inference.

**Key Features Already Present:**
- ✅ Auto-save: `recordAnswer()` debounces (600ms) and calls `sessionsApi.saveAnswer()`
- ✅ Submission handling: `handleSubmit()` calls `sessionsApi.submit()`
- ✅ PostgreSQL Storage: Answers stored in `answers` table
- ✅ Answer Reconstruction: Numeric indices for multiple_choice, raw text for others
- ✅ Monitoring: All events logged to backend with risk scoring

---

## Full Workflow Verification

### Step 1: Recruiter Creates Assessment

**Expected API Flow:**
```
POST /api/v1/assessments
- title: "JavaScript & Logic Test"
- duration_minutes: 60
- status: "draft"
```

**SQL:** Creates row in `assessments` table

### Step 2: Recruiter Adds Questions

**Multiple Choice:**
```
POST /api/v1/assessments/{id}/questions
{
  "text": "What is 2 + 2?",
  "type": "multiple_choice",
  "marks": 1,
  "order": 1,
  "options": [
    {"text": "3", "isCorrect": false},
    {"text": "4", "isCorrect": true},
    {"text": "5", "isCorrect": false}
  ]
}
```

**Expected Result:**
- Question created in `questions` table
- Options created in `question_options` table (normalized)

**True/False:**
```
POST /api/v1/assessments/{id}/questions
{
  "text": "Paris is the capital of France",
  "type": "true_false",
  "marks": 1,
  "order": 2,
  "options": [
    {"text": "True", "isCorrect": true},
    {"text": "False", "isCorrect": false}
  ]
}
```

**Short Answer:**
```
POST /api/v1/assessments/{id}/questions
{
  "text": "Explain the concept of closure in JavaScript",
  "type": "short_answer",
  "marks": 3,
  "order": 3
}
```

**Coding (JavaScript):**
```
POST /api/v1/assessments/{id}/questions
{
  "text": "Write a function that returns the sum of all numbers in an array",
  "type": "coding",
  "marks": 5,
  "order": 4,
  "language": "javascript",
  "languages": ["javascript"],
  "entry_point": "sumArray",
  "starter_code": "function sumArray(arr) {\n  // Your code here\n}",
  "test_cases": [
    {
      "args": [[1, 2, 3]],
      "expected_output": "6",
      "display": "sumArray([1, 2, 3]) → 6",
      "hidden": false,
      "order": 1
    }
  ]
}
```

**Coding (Java):**
```
POST /api/v1/assessments/{id}/questions
{
  "text": "Implement a function that checks if a string is a palindrome",
  "type": "coding",
  "marks": 5,
  "order": 5,
  "language": "java",
  "languages": ["java"],
  "entry_point": "isPalindrome",
  "starter_code": "public class Solution {\n  public static boolean isPalindrome(String s) {\n    // Your code here\n  }\n}",
  "test_cases": [
    {
      "args": ["racecar"],
      "expected_output": "true",
      "display": "isPalindrome(\"racecar\") → true",
      "hidden": false,
      "order": 1
    }
  ]
}
```

**SQL:** 
- Question created in `questions` table
- Options in `question_options` table
- Test cases in `test_cases` table

### Step 3: Recruiter Publishes Assessment

```
PATCH /api/v1/assessments/{id}/status
{"status": "active"}
```

**SQL:** `assessments.status` → "active", `start_time` set, `end_time` calculated

### Step 4: Candidate Starts Assessment

**Frontend:**
1. Candidate navigates to `/candidate/assessment/{id}`
2. Sees pre-flight checklist (camera, microphone, identity verification)
3. Clicks "Begin Assessment (Fullscreen)"

**Backend:**
```
POST /api/v1/sessions
{
  "assessmentId": "{id}",
  "deviceFingerprint": "...",
  "deviceInfo": {...}
}
```

**SQL:**
- Row created in `assessment_sessions` table
- status: "in_progress"
- monitoring_enabled: true (if assessment requires it)
- risk_score: 0
- integrity_score: 100

### Step 5: Candidate Completes All Question Types

#### 5a. Multiple Choice
- **Candidate Action:** Clicks on option "4"
- **Frontend:** `recordAnswer(question, 2)` (0-indexed)
- **Backend Call:**
  ```
  POST /api/v1/sessions/{sessionId}/answers
  {
    "questionId": "{qId}",
    "response": "4"  // Option text
  }
  ```
- **SQL:** `answers` table
  ```
  INSERT INTO answers (session_id, question_id, response, created_at)
  VALUES ('{sessionId}', '{qId}', '4', NOW())
  ```

#### 5b. True/False
- **Candidate Action:** Clicks "True"
- **Frontend:** `recordAnswer(question, "True")`
- **Backend Call:**
  ```
  POST /api/v1/sessions/{sessionId}/answers
  {
    "questionId": "{qId}",
    "response": "True"
  }
  ```
- **SQL:**
  ```
  INSERT INTO answers (...) VALUES (..., 'True', ...)
  ```

#### 5c. Short Answer
- **Candidate Action:** Types "Closure is when a function has access to variables from its outer scope"
- **Frontend:** `recordAnswer(question, text)` (auto-saves on change, debounced 600ms)
- **Backend Call:**
  ```
  POST /api/v1/sessions/{sessionId}/answers
  {
    "questionId": "{qId}",
    "response": "Closure is when..."
  }
  ```
- **SQL:**
  ```
  INSERT INTO answers (...) VALUES (..., 'Closure is when...', ...)
  ```

#### 5d. Coding (JavaScript)
- **Candidate Action:** Types JavaScript code in Monaco Editor
- **Frontend:** `recordAnswer(question, code)` + telemetry
- **Backend Call:**
  ```
  POST /api/v1/sessions/{sessionId}/answers
  {
    "questionId": "{qId}",
    "response": "function sumArray(arr) { return arr.reduce((a,b) => a+b, 0); }",
    "selectedLanguage": "javascript",
    "keystrokeStats": {
      "totalKeystrokes": 45,
      "codeLength": 62,
      "averageWPM": 35,
      ...
    }
  }
  ```
- **SQL:**
  ```
  INSERT INTO answers (..., response, selected_language, keystroke_stats, ...)
  VALUES (..., 'function sumArray...', 'javascript', {...}, ...)
  ```

#### 5e. Coding (Java)
- **Candidate Action:** Types Java code
- **Frontend:** Same as JavaScript
- **Backend Call:** Same format, `selectedLanguage: "java"`

### Step 6: Candidate Submits Assessment

**Frontend:**
- Clicks "Submit" button
- Calls `handleSubmit()` which calls `sessionsApi.submit(sessionId)`

**Backend:**
```
POST /api/v1/sessions/{sessionId}/submit
```

**SQL:**
- `assessment_sessions.status` → "completed"
- `assessment_sessions.submitted_at` → NOW()
- Grading logic executes:
  - Objective questions (multiple_choice, true_false, coding) auto-graded
  - Short answers marked for recruiter review
  - `grading_status` set to "processing" or "graded"
  - `percentage` and `score` calculated
  - `passed` set based on pass_mark

### Step 7: Recruiter Reviews Submissions

**Frontend:**
- Recruiter navigates to assessment view
- Sees list of candidates with status badges

**Backend:**
```
GET /api/v1/assessments/{id}/sessions
```

**Response:**
```json
{
  "items": [
    {
      "id": "{sessionId}",
      "candidateId": "{cId}",
      "candidateName": "John Doe",
      "status": "completed",
      "percentage": 85,
      "score": 17,
      "maxScore": 20,
      "passed": true,
      "integrityScore": 95,
      "riskScore": 12,
      "riskLevel": "low",
      "gradingStatus": "processing"  // short answers pending
    }
  ]
}
```

**Recruiter Actions:**
1. Clicks session to view detailed results
2. Reviews auto-graded questions (multiple_choice, true_false, coding)
3. Grades short answers manually
4. Reviews AI monitoring alerts and gaze tracking data

---

## PostgreSQL Tables & Data Flow

### assessments
```sql
CREATE TABLE assessments (
    id UUID PRIMARY KEY,
    title VARCHAR(255),
    duration_minutes INT,
    status ENUM('draft', 'active', 'completed', 'cancelled'),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    ...
);
```

### questions
```sql
CREATE TABLE questions (
    id UUID PRIMARY KEY,
    assessment_id UUID REFERENCES assessments(id),
    text TEXT,
    type ENUM('multiple_choice', 'true_false', 'short_answer', 'coding'),
    marks FLOAT,
    order INT,
    language ENUM('javascript', 'java'),  -- NULL for non-coding
    languages JSON,  -- NULL or ["javascript", "java"]
    entry_point VARCHAR(120),  -- NULL for non-coding
    starter_code TEXT,  -- NULL for non-coding
    starter_codes JSON,  -- NULL for non-coding
    ...
);
```

### question_options
```sql
CREATE TABLE question_options (
    id UUID PRIMARY KEY,
    question_id UUID REFERENCES questions(id),
    text TEXT,
    is_correct BOOLEAN,
    explanation TEXT,
    order INT
);
```

### test_cases
```sql
CREATE TABLE test_cases (
    id UUID PRIMARY KEY,
    question_id UUID REFERENCES questions(id),
    args JSON,
    expected_output TEXT,
    display VARCHAR(255),
    hidden BOOLEAN,
    order INT
);
```

### assessment_sessions
```sql
CREATE TABLE assessment_sessions (
    id UUID PRIMARY KEY,
    assessment_id UUID REFERENCES assessments(id),
    candidate_id UUID REFERENCES users(id),
    status ENUM('in_progress', 'completed', 'abandoned', 'flagged'),
    started_at TIMESTAMP,
    submitted_at TIMESTAMP,
    score FLOAT,
    max_score FLOAT,
    percentage FLOAT,
    passed BOOLEAN,
    risk_score FLOAT,
    risk_level ENUM('low', 'medium', 'high'),
    integrity_score FLOAT,
    grading_status ENUM('processing', 'graded', 'under_review'),
    monitoring_enabled BOOLEAN,
    ...
);
```

### answers
```sql
CREATE TABLE answers (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES assessment_sessions(id),
    question_id UUID REFERENCES questions(id),
    response TEXT,  -- Raw answer: option text, "True"/"False", essay text, or code
    selected_language VARCHAR(50),  -- 'javascript' or 'java' for coding questions
    keystroke_stats JSON,  -- Telemetry for coding questions
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## Testing Checklist

### ✅ Backend Query Fix
- [ ] Verify `QuestionRepository.for_assessment()` loads options and test cases
- [ ] SQL query should use `selectinload()` for eager loading
- [ ] No N+1 queries when fetching questions

### ✅ Frontend Rendering
- [ ] Multiple Choice: Radio buttons appear, selection persists
- [ ] True/False: Two radio buttons (True/False) render correctly
- [ ] Short Answer: Textarea renders with placeholder
- [ ] Coding: Monaco Editor appears with syntax highlighting
  - [ ] Language selector shows available languages
  - [ ] Starter code loads in editor
  - [ ] Test cases display below editor
  - [ ] Run tests button works (if implemented)

### ✅ Auto-Save
- [ ] Change answer → API call fires after 600ms
- [ ] Multiple rapid changes → debounced to one API call
- [ ] Offline changes → queued and saved when online
- [ ] Backend receives answer with correct format:
  - [ ] multiple_choice: option text
  - [ ] true_false: "True" or "False"
  - [ ] short_answer: plain text
  - [ ] coding: code + language + keystroke stats

### ✅ Submission
- [ ] Click "Submit" → API call to `/sessions/{id}/submit`
- [ ] Backend marks session as "completed"
- [ ] Grading logic runs, calculates score
- [ ] Candidate sees results page with:
  - [ ] Score percentage
  - [ ] Pass/Fail badge
  - [ ] Integrity score
  - [ ] Risk score
  - [ ] Behavior analysis

### ✅ PostgreSQL Storage
Verify data in database:
```sql
-- Check answers were saved
SELECT question_id, response, selected_language FROM answers 
WHERE session_id = '{sessionId}' ORDER BY created_at;

-- Verify question data integrity
SELECT 
  q.id, q.text, q.type, q.marks,
  (SELECT COUNT(*) FROM question_options WHERE question_id = q.id) as option_count,
  (SELECT COUNT(*) FROM test_cases WHERE question_id = q.id) as test_case_count
FROM questions q
WHERE q.assessment_id = '{assessmentId}';

-- Check session completion
SELECT id, status, submitted_at, score, percentage, passed, grading_status
FROM assessment_sessions
WHERE id = '{sessionId}';
```

### ✅ End-to-End Flow

**Preconditions:**
1. Backend running with PostgreSQL
2. Frontend dev server running
3. User authenticated as recruiter

**Test Steps:**

1. **Recruiter Setup:**
   ```
   POST /api/v1/assessments
   - Create assessment with 5 questions (1 each type)
   - Add all question types
   - PATCH status to "active"
   ```

2. **Candidate Attempt:**
   ```
   Navigate to /candidate/assessment/{id}
   - Verify identity (face detection)
   - Click "Begin Assessment"
   - Answer all 5 questions:
     * Multiple Choice: select option
     * True/False: select True or False
     * Short Answer: type essay response
     * Coding (JavaScript): write function
     * Coding (Java): write code snippet
   - Monitor auto-save (network tab)
   - Click "Submit"
   ```

3. **Verify Results:**
   ```
   - Candidate sees score page
   - Recruiter can view session details
   - All answers in PostgreSQL
   - Scores calculated correctly
   ```

---

## Debugging Tips

### Question Options Not Appearing
1. Check backend repository query:
   ```python
   # Should use selectinload
   .selectinload(Question.option_rows)
   ```
2. Check API response includes `options` field
3. Check QuestionPublicSchema strips only answer keys, not options

### Auto-Save Not Working
1. Open browser DevTools → Network tab
2. Change answer, wait 600ms
3. Should see `POST /sessions/{id}/answers`
4. Check `response` field format:
   - Multiple choice: should be option text, not index
   - Others: should be string value

### Answers Not Saving to Database
1. Verify `answers` table exists in PostgreSQL
2. Check `session_id` and `question_id` are valid UUIDs
3. Verify `assessment_sessions` status is "in_progress"
4. Check backend logs for validation errors

### Scoring Issues
1. Check `pass_mark` on assessment
2. Verify test cases are correct
3. Check grading logic in `session_service.py`
4. Verify multiple_choice answers match option text exactly

---

## Performance Considerations

**Database Queries:**
- `for_assessment()` uses `selectinload()` → O(n) queries (3 total)
- No N+1 queries
- Index on `assessment_id` in questions, options, test_cases

**Frontend:**
- Auto-save debounced to 600ms
- CodeEditor only updates on change (not on every keystroke)
- Question rendering memoized to prevent unnecessary re-renders

**Network:**
- Answers saved individually (can batch if needed)
- Large code submissions may timeout (consider chunking)

---

## Migration from Mock Data

The implementation uses only real backend data:
- No mock data in components
- All questions fetched from `/api/v1/assessments/{id}/questions`
- All answers saved to `/api/v1/sessions/{id}/answers`
- Complete PostgreSQL storage and retrieval workflow
