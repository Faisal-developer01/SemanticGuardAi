"""Coding integrity analysis: plagiarism similarity + AI-generated-code heuristics.

Runs on JavaScript and Java submissions. Combines three signals:

* **Similarity** — winnowing fingerprints (robust to renaming/reformatting)
  compared against every other candidate's answer to the same question.
* **AI-generated likelihood** — heuristics over the code and the candidate's
  typing biometrics (a large gap between final code length and actual keystrokes
  is a strong "pasted / AI-generated" signal).
* **Copy/paste** — paste activity captured by the editor.

Results are stored on the answer (``code_analysis``) and surfaced to recruiters.
"""
from __future__ import annotations

import hashlib
import re

from sqlalchemy import select

from app.models import Answer, AssessmentSession, User
from app.models.enums import QuestionType
from app.repositories import answers as answers_repo

# ─── normalization + fingerprinting ──────────────────────────────────────────

_LINE_COMMENT = re.compile(r"//[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_STRINGS = re.compile(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`", re.DOTALL)
_WS = re.compile(r"\s+")
_TOKEN = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[^\sA-Za-z0-9_$]")

# Control-flow / declaration keywords kept verbatim so program *structure* is
# preserved; every other identifier collapses to a single token so that simply
# renaming variables/methods cannot hide a copied solution. Covers JS + Java.
_KEYWORDS = frozenset({
    "var", "let", "const", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "default", "break", "continue", "new", "typeof", "instanceof",
    "this", "class", "extends", "super", "try", "catch", "finally", "throw", "throws",
    "in", "of", "void", "delete", "yield", "async", "await", "null", "true", "false",
    "undefined", "public", "private", "protected", "static", "final", "abstract",
    "int", "long", "double", "float", "boolean", "char", "byte", "short",
    "interface", "implements", "import", "package", "enum", "synchronized",
})


def _strip_comments(code: str) -> tuple[str, int]:
    """Return code without comments, and the number of comment characters removed."""
    comment_chars = 0
    for m in _BLOCK_COMMENT.finditer(code):
        comment_chars += len(m.group(0))
    for m in _LINE_COMMENT.finditer(code):
        comment_chars += len(m.group(0))
    stripped = _BLOCK_COMMENT.sub(" ", code)
    stripped = _LINE_COMMENT.sub(" ", stripped)
    return stripped, comment_chars


def normalize_code(code: str) -> str:
    """Canonicalize code so trivial reformatting/renaming doesn't hide copies.

    Comments and string contents are removed, then the token stream is rebuilt
    with all non-keyword identifiers mapped to ``v`` and numbers to ``n`` — so a
    copied solution with renamed variables still produces a near-identical
    fingerprint.
    """
    if not code:
        return ""
    stripped, _ = _strip_comments(code)
    stripped = _STRINGS.sub('""', stripped)  # neutralize string contents
    out: list[str] = []
    for tok in _TOKEN.findall(stripped):
        first = tok[0]
        if first.isalpha() or first in "_$":
            out.append(tok if tok in _KEYWORDS else "v")
        elif first.isdigit():
            out.append("n")
        else:
            out.append(tok)
    return "".join(out).lower()


def _h(gram: str) -> int:
    return int.from_bytes(hashlib.md5(gram.encode("utf-8")).digest()[:8], "big")


def fingerprints(normalized: str, k: int = 5, w: int = 4) -> set[int]:
    """Winnowing fingerprints: the min hash of each sliding window of k-grams."""
    if len(normalized) < k:
        return {_h(normalized)} if normalized else set()
    hashes = [_h(normalized[i:i + k]) for i in range(len(normalized) - k + 1)]
    if len(hashes) < w:
        return {min(hashes)}
    fps: set[int] = set()
    for i in range(len(hashes) - w + 1):
        fps.add(min(hashes[i:i + w]))
    return fps


def similarity(fp_a: set[int], fp_b: set[int]) -> float:
    """Jaccard similarity of two fingerprint sets (0..1)."""
    if not fp_a or not fp_b:
        return 0.0
    inter = len(fp_a & fp_b)
    union = len(fp_a | fp_b)
    return inter / union if union else 0.0


# ─── AI-generated-code heuristics ────────────────────────────────────────────

_AI_PHRASES = (
    "as an ai", "here's a", "here is a", "this function", "step 1", "step 2",
    "explanation:", "note that", "example usage", "you can use", "in this solution",
    "the following", "we can", "let's", "first, we", "// example", "return the result",
)


def ai_likelihood(code: str, keystroke_stats: dict | None) -> dict:
    """Heuristic 0..100 likelihood that code was pasted / AI-generated."""
    reasons: list[str] = []
    score = 0.0
    code = code or ""
    code_len = len(code.strip())
    lower = code.lower()

    ks = keystroke_stats or {}
    keystrokes = int(ks.get("keystrokes") or 0)
    chars_typed = int(ks.get("chars") or 0)
    pasted_chars = int(ks.get("pastedChars") or 0)
    paste_count = int(ks.get("pasteCount") or 0)
    avg_interval = float(ks.get("avgIntervalMs") or 0.0)

    # 1) Typing-vs-code gap: the strongest signal. If the final code is far larger
    #    than what was actually typed, it was pasted or inserted.
    if code_len > 60 and keystroke_stats is not None:
        typed_ratio = chars_typed / code_len if code_len else 1.0
        if typed_ratio < 0.35:
            score += 45
            reasons.append("Final code far exceeds typing activity (likely pasted or AI-generated)")
        elif typed_ratio < 0.6:
            score += 20
            reasons.append("Low typing-to-code ratio")

    # 2) Explicit paste activity.
    if pasted_chars > 40 or paste_count > 0:
        score += 25
        reasons.append(f"Paste activity detected ({pasted_chars} characters)")

    # 3) Inhuman typing speed.
    if keystrokes > 60 and 0 < avg_interval < 45:
        score += 15
        reasons.append("Unusually fast, machine-like typing cadence")

    # 4) AI-style prose in comments.
    matched = [p for p in _AI_PHRASES if p in lower]
    if matched:
        score += min(25, 8 * len(matched))
        reasons.append("Explanatory/AI-style phrasing in comments")

    # 5) Heavy commenting relative to code.
    _, comment_chars = _strip_comments(code)
    if code_len > 80 and comment_chars / code_len > 0.28:
        score += 12
        reasons.append("Unusually heavy commenting")

    return {"score": round(min(100.0, score), 1), "reasons": reasons}


# ─── session-level analysis ──────────────────────────────────────────────────

def _other_answers(assessment_id, question_id, candidate_id) -> list[Answer]:
    """Other candidates' answers to the same question in submitted attempts."""
    stmt = (
        select(Answer)
        .join(AssessmentSession, Answer.session_id == AssessmentSession.id)
        .where(
            Answer.question_id == question_id,
            AssessmentSession.assessment_id == assessment_id,
            AssessmentSession.candidate_id != candidate_id,
            Answer.response.isnot(None),
        )
    )
    return list(answers_repo.session.execute(stmt).scalars().all())


def _candidate_name(candidate_id) -> str:
    user = answers_repo.session.get(User, candidate_id)
    return getattr(user, "full_name", None) or "Candidate"


def _verdict(similarity_score: float, ai_score: float) -> str:
    if similarity_score >= 0.7:
        return "likely_copy"
    if ai_score >= 60:
        return "likely_ai_generated"
    if similarity_score >= 0.45 or ai_score >= 35:
        return "review"
    return "clean"


def analyze_answer(answer: Answer, question, assessment_id, candidate_id) -> dict:
    code = answer.response or ""
    normalized = normalize_code(code)
    fp = fingerprints(normalized)

    best_score = 0.0
    best_candidate = None
    for other in _other_answers(assessment_id, question.id, candidate_id):
        other_fp = fingerprints(normalize_code(other.response or ""))
        s = similarity(fp, other_fp)
        if s > best_score:
            best_score = s
            other_session = answers_repo.session.get(AssessmentSession, other.session_id)
            best_candidate = getattr(other_session, "candidate_id", None)

    ai = ai_likelihood(code, answer.keystroke_stats)
    report = {
        "language": answer.selected_language or (question.language.value if question.language else None),
        "codeLength": len(code),
        "similarity": {
            "score": round(best_score, 3),
            "percent": round(best_score * 100, 1),
            "matchedCandidateId": str(best_candidate) if best_candidate else None,
            "matchedCandidateName": _candidate_name(best_candidate) if best_candidate else None,
        },
        "ai": ai,
        "keystroke": answer.keystroke_stats or None,
        "verdict": _verdict(best_score, ai["score"]),
    }
    return report


def analyze_session(session) -> None:
    """Analyze every coding answer in a session and store the report on it."""
    question_map = {str(q.id): q for q in session.assessment.questions} if session.assessment else {}
    changed = False
    for answer in answers_repo.for_session(session.id):
        question = question_map.get(str(answer.question_id))
        if not question or question.type != QuestionType.coding or not answer.response:
            continue
        answer.code_analysis = analyze_answer(
            answer, question, session.assessment_id, session.candidate_id
        )
        changed = True
    if changed:
        answers_repo.session.commit()


def session_report(session) -> list[dict]:
    """Assemble the recruiter-facing code-integrity report for a session."""
    question_map = {str(q.id): q for q in session.assessment.questions} if session.assessment else {}
    out: list[dict] = []
    for answer in answers_repo.for_session(session.id):
        question = question_map.get(str(answer.question_id))
        if not question or question.type != QuestionType.coding:
            continue
        analysis = answer.code_analysis
        if analysis is None and answer.response:
            analysis = analyze_answer(answer, question, session.assessment_id, session.candidate_id)
        out.append({
            "questionId": str(question.id),
            "questionText": question.text,
            "language": answer.selected_language or (question.language.value if question.language else None),
            "answered": bool(answer.response),
            "analysis": analysis,
        })
    return out
