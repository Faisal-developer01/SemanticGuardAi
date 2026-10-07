"""Read sanitized Azure worker/startup diagnostics using the deployment profile."""
from __future__ import annotations

import base64
import json
import os
import urllib.request
from urllib.parse import quote, urlsplit
import xml.etree.ElementTree as ET


profile = next(
    item for item in ET.fromstring(os.environ["AZURE_PUBLISH_PROFILE"]).iter("publishProfile")
    if item.get("publishMethod") in {"MSDeploy", "ZipDeploy"}
)
host = urlsplit("https://" + profile.attrib["publishUrl"]).hostname
authorization = base64.b64encode(
    f"{profile.attrib['userName']}:{profile.attrib['userPWD']}".encode()
).decode()

def read(path: str) -> bytes:
    request = urllib.request.Request(
        f"https://{host}{path}",
        headers={"Authorization": "Basic " + authorization},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


logs = [
    item for item in json.loads(read("/api/vfs/LogFiles/"))
    if item["name"].endswith("docker.log")
]
logs.sort(key=lambda item: item["mtime"])
print("Worker startup log evidence:")
for item in logs[-4:]:
    text = read("/api/vfs/LogFiles/" + quote(item["name"])).decode(errors="replace")
    for line in text.splitlines()[-4000:]:
        if any(marker in line for marker in (
            "Using worker:", "registered application handlers", "Launching Gunicorn",
        )):
            print(line[:350])
