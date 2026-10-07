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
echo "Sanitized Gunicorn process metadata:"
ps -eo pid,nlwp,args | awk '/[g]unicorn/ && !/awk/ {
  print "pid=" $1, "threads=" $2, "gthread=" (index($0, "gthread") > 0), "eventlet=" (index($0, "eventlet") > 0)
}'
echo "Worker startup log evidence:"
for path in /home/LogFiles/*docker.log; do
  if [ -f "$path" ]; then
    tail -n 4000 "$path" | grep -E 'Using worker:|registered application handlers|Launching Gunicorn' | tail -n 25
  fi
done
"""
request = urllib.request.Request(
    f"https://{host}/api/command",
    data=json.dumps({"command": "bash -c " + shlex.quote(command), "dir": "/home"}).encode(),
    headers={"Authorization": "Basic " + authorization, "Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=60) as response:
    payload = json.load(response)
if payload.get("ExitCode") != 0:
    error = str(payload.get("Error") or payload.get("Output") or "No command error returned")
    for secret in (profile.attrib["userName"], profile.attrib["userPWD"], authorization):
        error = error.replace(secret, "<redacted>")
    raise RuntimeError(f"Azure diagnostic command failed: {error[:2000]}")
print(payload["Output"])
