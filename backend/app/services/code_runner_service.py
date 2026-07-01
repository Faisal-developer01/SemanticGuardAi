import os
import tempfile
import subprocess
import json
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def compare_output(actual: Any, expected: Any) -> bool:
    """Normalize and compare actual output against expected output."""
    if actual is None:
        return False
    
    actual_str = str(actual).strip()
    expected_str = str(expected).strip()
    
    if actual_str == expected_str:
        return True
    
    # Structural JSON comparison (for arrays/objects)
    try:
        if json.loads(actual_str) == json.loads(expected_str):
            return True
    except Exception:
        pass
    
    # Strip all whitespaces for a looser comparison
    try:
        act_clean = "".join(actual_str.split())
        exp_clean = "".join(expected_str.split())
        if act_clean == exp_clean:
            return True
    except Exception:
        pass
        
    return False

def format_java_arg(arg: Any) -> str:
    """Helper to convert Python argument to Java literal."""
    if isinstance(arg, bool):
        return "true" if arg else "false"
    elif isinstance(arg, (int, float)):
        return str(arg)
    elif isinstance(arg, str):
        # Escape string
        escaped = arg.replace('"', '\\"')
        return f'"{escaped}"'
    elif isinstance(arg, list):
        if not arg:
            return "new Object[]{}"
        first = arg[0]
        if isinstance(first, int):
            elements = ", ".join(str(x) for x in arg)
            return f"new int[]{{{elements}}}"
        elif isinstance(first, float):
            elements = ", ".join(str(x) for x in arg)
            return f"new double[]{{{elements}}}"
        elif isinstance(first, str):
            elements = ", ".join(f'"{x.replace(chr(34), chr(92) + chr(34))}"' for x in arg)
            return f"new String[]{{{elements}}}"
        elif isinstance(first, bool):
            elements = ", ".join("true" if x else "false" for x in arg)
            return f"new boolean[]{{{elements}}}"
        elif isinstance(first, list):
            # Nested list: 2D array representation
            elements = ", ".join(format_java_arg(x) for x in arg)
            # Find the type of nested elements
            if first and isinstance(first[0], int):
                return f"new int[][]{{{elements}}}"
            elif first and isinstance(first[0], float):
                return f"new double[][]{{{elements}}}"
            elif first and isinstance(first[0], str):
                return f"new String[][]{{{elements}}}"
            elif first and isinstance(first[0], bool):
                return f"new boolean[][]{{{elements}}}"
    return str(arg)

def run_javascript(code: str, entry_point: str, test_cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Execute JavaScript code using node subprocess."""
    results = []
    
    tc_json = json.dumps([{"args": tc.get("args", []), "expected": tc.get("expected_output", "")} for tc in test_cases])
    # Construct runner script
    runner_code = f"""
{code}

const testCases = {tc_json};
const results = [];

for (const tc of testCases) {{
    try {{
        const output = {entry_point}(...tc.args);
        results.push({{
            output: typeof output === 'object' ? JSON.stringify(output) : String(output),
            error: null
        }});
    }} catch (e) {{
        results.push({{
            output: null,
            error: e.toString()
        }});
    }}
}}
console.log("===RESULTS===" + JSON.stringify(results));
"""

    
    with tempfile.TemporaryDirectory() as tmpdir:
        script_path = os.path.join(tmpdir, "solution.js")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(runner_code)
            
        try:
            proc = subprocess.run(
                ["node", script_path],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if proc.returncode != 0:
                err_msg = proc.stderr or proc.stdout or "Execution failed"
                return [{"passed": False, "output": None, "error": err_msg} for _ in test_cases]
                
            stdout = proc.stdout
            if "===RESULTS===" in stdout:
                parts = stdout.split("===RESULTS===")
                test_outputs = json.loads(parts[1])
                
                for idx, tc in enumerate(test_cases):
                    actual = test_outputs[idx]
                    passed = compare_output(actual["output"], tc.get("expected_output", ""))
                    results.append({
                        "passed": passed,
                        "output": actual["output"],
                        "error": actual["error"]
                    })
            else:
                return [{"passed": False, "output": None, "error": "Could not find execution results block"} for _ in test_cases]
                
        except subprocess.TimeoutExpired:
            return [{"passed": False, "output": None, "error": "Execution timed out"} for _ in test_cases]
        except Exception as e:
            return [{"passed": False, "output": None, "error": str(e)} for _ in test_cases]
            
    return results

def run_java(code: str, entry_point: str, test_cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Compile and execute Java code using javac and java subprocesses."""
    results = []
    
    # Construct Java Runner source code
    runner_cases_code = []
    for idx, tc in enumerate(test_cases):
        args_formatted = ", ".join(format_java_arg(arg) for arg in tc.get("args", []))
        runner_cases_code.append(f"""
        System.out.println("===TC_START==={idx}");
        try {{
            Object res = solver.{entry_point}({args_formatted});
            if (res instanceof int[]) {{
                System.out.println(java.util.Arrays.toString((int[])res));
            }} else if (res instanceof double[]) {{
                System.out.println(java.util.Arrays.toString((double[])res));
            }} else if (res instanceof String[]) {{
                System.out.println(java.util.Arrays.toString((String[])res));
            }} else if (res instanceof boolean[]) {{
                System.out.println(java.util.Arrays.toString((boolean[])res));
            }} else if (res instanceof Object[]) {{
                System.out.println(java.util.Arrays.deepToString((Object[])res));
            }} else {{
                System.out.println(res);
            }}
        }} catch (Exception e) {{
            System.out.println("===ERROR===" + e.toString());
        }}
        System.out.println("===TC_END==={idx}");
        """)
        
    runner_source = f"""
public class Runner {{
    public static void main(String[] args) {{
        Solution solver = new Solution();
        {"".join(runner_cases_code)}
    }}
}}
"""
    
    # Ensure Java source file uses the Solution class name
    # Candidate code must contain "class Solution"
    solution_source = code
    if "class Solution" not in code:
        # Wrap the code in a class Solution if they didn't define it
        solution_source = f"""
public class Solution {{
    {code}
}}
"""
        
    with tempfile.TemporaryDirectory() as tmpdir:
        sol_path = os.path.join(tmpdir, "Solution.java")
        run_path = os.path.join(tmpdir, "Runner.java")
        
        with open(sol_path, "w", encoding="utf-8") as f:
            f.write(solution_source)
        with open(run_path, "w", encoding="utf-8") as f:
            f.write(runner_source)
            
        try:
            # Compile both Solution and Runner
            compile_proc = subprocess.run(
                ["javac", "Solution.java", "Runner.java"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=8
            )
            
            if compile_proc.returncode != 0:
                err_msg = compile_proc.stderr or compile_proc.stdout or "Compilation failed"
                return [{"passed": False, "output": None, "error": err_msg} for _ in test_cases]
                
            # Run Runner
            run_proc = subprocess.run(
                ["java", "Runner"],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if run_proc.returncode != 0:
                err_msg = run_proc.stderr or run_proc.stdout or "Runtime error"
                return [{"passed": False, "output": None, "error": err_msg} for _ in test_cases]
                
            stdout = run_proc.stdout
            # Parse test case output blocks
            for idx, tc in enumerate(test_cases):
                start_tag = f"===TC_START==={idx}"
                end_tag = f"===TC_END==={idx}"
                if start_tag in stdout and end_tag in stdout:
                    block = stdout.split(start_tag)[1].split(end_tag)[0].strip()
                    if "===ERROR===" in block:
                        err = block.split("===ERROR===")[1].strip()
                        results.append({"passed": False, "output": None, "error": err})
                    else:
                        actual = block
                        passed = compare_output(actual, tc.get("expected_output", ""))
                        results.append({
                            "passed": passed,
                            "output": actual,
                            "error": None
                        })
                else:
                    results.append({"passed": False, "output": None, "error": "Test case execution did not complete"})
                    
        except subprocess.TimeoutExpired:
            return [{"passed": False, "output": None, "error": "Execution timed out"} for _ in test_cases]
        except Exception as e:
            return [{"passed": False, "output": None, "error": str(e)} for _ in test_cases]
            
    return results

def grade_coding_question(code: str, language: str, entry_point: str, test_cases: list) -> Dict[str, Any]:
    """Execute candidate answer against list of test cases and return grading output."""
    if not code or not test_cases:
        return {"passed": 0, "total": 0, "results": []}
        
    # Serialize test case models to dicts
    tc_dicts = []
    for tc in test_cases:
        tc_dicts.append({
            "args": tc.args,
            "expected_output": tc.expected_output,
            "display": getattr(tc, "display", ""),
            "hidden": getattr(tc, "hidden", False)
        })
        
    language = language.lower()
    if language == "javascript":
        results = run_javascript(code, entry_point, tc_dicts)
    elif language == "java":
        results = run_java(code, entry_point, tc_dicts)
    else:
        results = [{"passed": False, "output": None, "error": f"Unsupported language: {language}"} for _ in test_cases]
        
    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(test_cases)
    
    return {
        "passed": passed_count,
        "total": total_count,
        "results": results
    }
