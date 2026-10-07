"""Read sanitized Azure worker/startup diagnostics using the deployment profile."""
from __future__ import annotations

import base64
import json
import os
import shlex
import urllib.request
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET


profile = next(
    item for item in ET.fromstring(os.environ["AZURE_PUBLISH_PROFILE"]).iter("publishProfile")
    if item.get("publishMethod") in {"MSDeploy", "ZipDeploy"}
)
host = urlsplit("https://" + profile.attrib["publishUrl"]).hostname
authorization = base64.b64encode(
    f"{profile.attrib['userName']}:{profile.attrib['userPWD']}".encode()
).decode()

command = r"""
import glob, json, os, pathlib, re
result = {"processes": [], "startup_logs": []}
for filename in glob.glob("/proc/[0-9]*/cmdline"):
    try:
        text = pathlib.Path(filename).read_bytes().decode(errors="replace").replace("\0", " ")
        if "gunicorn" not in text or "import glob, json" in text:
            continue
        pid = filename.split("/")[2]
        status = pathlib.Path("/proc/" + pid + "/status").read_text()
        threads = re.search(r"^Threads:\s*(\d+)", status, re.M)
        result["processes"].append({
            "pid": int(pid), "gthread": "gthread" in text, "eventlet": "eventlet" in text,
            "threads": int(threads.group(1)) if threads else None,
            "cwd": os.readlink("/proc/" + pid + "/cwd"),
        })
    except (OSError, UnicodeError) as error:
        result.setdefault("read_errors", []).append(type(error).__name__)
logs = sorted(pathlib.Path("/home/LogFiles").glob("*docker.log"), key=lambda p: p.stat().st_mtime)[-4:]
for path in logs:
    lines = path.read_text(errors="replace").splitlines()[-4000:]
    for line in lines:
        if re.search(r"Using worker:|registered application handlers|recruiter joined monitoring room", line):
            line = re.sub(r"(?:user_id|session_id|candidate_id|assessment_id|sid)=[^\s]+", "<redacted>", line)
            result["startup_logs"].append(line[:350])
result["startup_logs"] = result["startup_logs"][-25:]
print(json.dumps(result))
"""
request = urllib.request.Request(
    f"https://{host}/api/command",
    data=json.dumps({"command": "python3 -c " + shlex.quote(command), "dir": "/home"}).encode(),
    headers={"Authorization": "Basic " + authorization, "Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=60) as response:
    payload = json.load(response)
if payload.get("ExitCode") != 0:
    raise RuntimeError(f"Azure diagnostic command failed with exit code {payload.get('ExitCode')}")
print(payload["Output"])
