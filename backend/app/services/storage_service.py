"""File storage abstraction for proctoring evidence (screen recordings, etc.).

Supports a local filesystem backend (default, works out of the box) and Azure
Blob Storage for production. Callers work with opaque ``storage_key`` strings and
never touch the backend directly.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from flask import current_app


@dataclass
class StoredObject:
    storage_key: str
    url: str | None
    size_bytes: int
    sha256: str
    content_type: str | None


def _provider() -> str:
    return (current_app.config.get("STORAGE_PROVIDER") or "local").lower()


def _azure_enabled() -> bool:
    """Azure Blob is used when the provider is 'azure' and either a managed-identity
    account URL or a connection string is configured."""
    return _provider() == "azure" and bool(
        current_app.config.get("AZURE_STORAGE_ACCOUNT_URL")
        or current_app.config.get("AZURE_STORAGE_CONNECTION_STRING")
    )


# ─── local backend ───────────────────────────────────────────────────────────

def _local_base() -> Path:
    configured = current_app.config.get("STORAGE_LOCAL_PATH") or "uploads"
    p = Path(configured)
    if not p.is_absolute():
        p = Path(current_app.instance_path) / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def _local_path(storage_key: str) -> Path:
    return _local_base() / storage_key


def _save_local(data: bytes, storage_key: str) -> None:
    path = _local_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _read_local(storage_key: str) -> bytes:
    return _local_path(storage_key).read_bytes()


# ─── Azure Blob backend ──────────────────────────────────────────────────────

def _blob_client(storage_key: str):
    from azure.storage.blob import BlobServiceClient

    container = current_app.config.get("AZURE_STORAGE_CONTAINER", "evidence")
    account_url = current_app.config.get("AZURE_STORAGE_ACCOUNT_URL")
    if account_url:
        # Managed-identity / DefaultAzureCredential access (no account key).
        from azure.identity import DefaultAzureCredential

        client_id = current_app.config.get("AZURE_CLIENT_ID") or os.getenv("AZURE_CLIENT_ID")
        credential = DefaultAzureCredential(managed_identity_client_id=client_id) if client_id else DefaultAzureCredential()
        service = BlobServiceClient(account_url=account_url, credential=credential)
    else:
        conn = current_app.config["AZURE_STORAGE_CONNECTION_STRING"]
        service = BlobServiceClient.from_connection_string(conn)
    try:
        service.create_container(container)
    except Exception:  # noqa: BLE001 - container already exists
        pass
    return service.get_blob_client(container=container, blob=storage_key)


def _save_azure(data: bytes, storage_key: str, content_type: str | None) -> str | None:
    from azure.storage.blob import ContentSettings

    client = _blob_client(storage_key)
    client.upload_blob(
        data, overwrite=True,
        content_settings=ContentSettings(content_type=content_type) if content_type else None,
    )
    return client.url


def _read_azure(storage_key: str) -> bytes:
    return _blob_client(storage_key).download_blob().readall()


# ─── public API ──────────────────────────────────────────────────────────────

def save(data: bytes, *, storage_key: str, content_type: str | None = None) -> StoredObject:
    sha = hashlib.sha256(data).hexdigest()
    size = len(data)
    url: str | None = None
    if _azure_enabled():
        url = _save_azure(data, storage_key, content_type)
    else:
        _save_local(data, storage_key)
    return StoredObject(storage_key=storage_key, url=url, size_bytes=size, sha256=sha, content_type=content_type)


def read(storage_key: str) -> bytes:
    if _azure_enabled():
        return _read_azure(storage_key)
    return _read_local(storage_key)


def delete(storage_key: str) -> None:
    if _azure_enabled():
        try:
            _blob_client(storage_key).delete_blob()
        except Exception:  # noqa: BLE001
            pass
        return
    try:
        os.remove(_local_path(storage_key))
    except OSError:
        pass
