from app.services import code_runner_service

def test_javascript_code_runner():
    code = """
    function sumEven(nums) {
        return nums.filter(x => x % 2 === 0).reduce((a, b) => a + b, 0);
    }
    """
    class MockTestCase:
        def __init__(self, args, expected_output, display="", hidden=False):
            self.args = args
            self.expected_output = expected_output
            self.display = display
            self.hidden = hidden

    test_cases = [
        MockTestCase([[1, 2, 3, 4]], "6"),
        MockTestCase([[1, 3, 5]], "0")
    ]
    
    res = code_runner_service.grade_coding_question(
        code=code,
        language="javascript",
        entry_point="sumEven",
        test_cases=test_cases
    )
    
    assert res["passed"] == 2
    assert res["total"] == 2
    assert res["results"][0]["passed"] is True
    assert res["results"][0]["output"] == "6"


def test_java_code_runner():
    code = """
    public class Solution {
        public int sumEven(int[] nums) {
            int sum = 0;
            for (int n : nums) {
                if (n % 2 == 0) sum += n;
            }
            return sum;
        }
    }
    """
    class MockTestCase:
        def __init__(self, args, expected_output, display="", hidden=False):
            self.args = args
            self.expected_output = expected_output
            self.display = display
            self.hidden = hidden

    test_cases = [
        MockTestCase([[1, 2, 3, 4]], "6"),
        MockTestCase([[1, 3, 5]], "0")
    ]
    
    res = code_runner_service.grade_coding_question(
        code=code,
        language="java",
        entry_point="sumEven",
        test_cases=test_cases
    )
    
    assert res["passed"] == 2
    assert res["total"] == 2
    assert res["results"][0]["passed"] is True
    assert res["results"][0]["output"] == "6"


def test_toggle_monitoring_auth(client, recruiter, candidate, auth_header):
    # Seed an assessment and session
    rec_headers = auth_header(client, "recruiter@test.rw")
    aid = client.post(
        "/api/v1/assessments",
        headers=rec_headers,
        json={"title": "Test monitoring toggle", "position": "Developer", "durationMinutes": 60},
    ).get_json()["id"]
    
    client.patch(f"/api/v1/assessments/{aid}/status", headers=rec_headers, json={"status": "active"})

    cand_headers = auth_header(client, "candidate@test.rw")
    start = client.post("/api/v1/sessions", headers=cand_headers, json={"assessmentId": aid})
    sid = start.get_json()["id"]
    
    # Try toggling monitoring as candidate -> should fail (403)
    res = client.post(f"/api/v1/sessions/{sid}/monitoring", headers=cand_headers, json={"enabled": False})
    assert res.status_code == 403
    
    # Toggle as recruiter -> should succeed (200)
    res = client.post(f"/api/v1/sessions/{sid}/monitoring", headers=rec_headers, json={"enabled": False})
    assert res.status_code == 200
    assert res.get_json()["monitoringEnabled"] is False

    # Toggle back
    res = client.post(f"/api/v1/sessions/{sid}/monitoring", headers=rec_headers, json={"enabled": True})
    assert res.status_code == 200
    assert res.get_json()["monitoringEnabled"] is True

