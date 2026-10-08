"""
backend/app/api/quantum_credentials.py — API Endpoints for Per-User IBM Quantum Credentials.

Endpoints:
- GET /api/quantum/credentials : Retrieve safe credential metadata (NEVER raw tokens)
- POST /api/quantum/credentials : Store / update encrypted IBM Quantum credentials
- DELETE /api/quantum/credentials : Remove stored credentials for the authenticated user
- POST /api/quantum/credentials/test : Test live connection using Qiskit Runtime without executing circuits
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.api.auth import get_current_user
from backend.app.services.quantum_credentials import (
    IBMQuantumCredentialService,
    mask_instance,
    mask_token,
)

router = APIRouter(prefix="/quantum/credentials", tags=["quantum-credentials"])


class SaveCredentialsRequest(BaseModel):
    api_token: str = Field(..., description="IBM Quantum API token.")
    crn: Optional[str] = Field(None, description="IBM Quantum instance CRN (optional).")


class CredentialsMetadataResponse(BaseModel):
    configured: bool
    crn_configured: bool
    instance_masked: Optional[str] = None
    token_masked: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_used_at: Optional[str] = None
    last_status: Optional[str] = None


@router.get("", response_model=CredentialsMetadataResponse)
def get_credentials_metadata(authorization: Optional[str] = Header(None)):
    """
    Returns only safe metadata about the authenticated user's IBM Quantum credentials.
    STRICT SECURITY RULE: The raw API token is NEVER returned.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access Quantum credentials.",
        )

    cred = IBMQuantumCredentialService.get_user_credentials(user["id"])
    if not cred:
        return CredentialsMetadataResponse(
            configured=False,
            crn_configured=False,
        )

    return CredentialsMetadataResponse(
        configured=True,
        crn_configured=bool(cred.get("crn_or_instance")),
        instance_masked=mask_instance(cred.get("crn_or_instance")),
        token_masked=mask_token(cred.get("encrypted_api_token", "")),
        created_at=cred.get("created_at"),
        updated_at=cred.get("updated_at"),
        last_used_at=cred.get("last_used_at"),
        last_status=cred.get("last_status") or "CONFIGURED",
    )


@router.post("", status_code=status.HTTP_200_OK)
def save_credentials(req: SaveCredentialsRequest, authorization: Optional[str] = Header(None)):
    """
    Encrypts and securely saves IBM Quantum credentials for the verified user.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to configure Quantum credentials.",
        )

    raw_token = req.api_token.strip()
    if not raw_token or len(raw_token) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid IBM Quantum API token. Token must not be empty.",
        )

    res = IBMQuantumCredentialService.save_user_credentials(
        user_id=user["id"],
        raw_token=raw_token,
        crn_or_instance=req.crn,
    )

    return res


@router.delete("", status_code=status.HTTP_200_OK)
def delete_credentials(authorization: Optional[str] = Header(None)):
    """
    Permanently deletes stored IBM Quantum credentials for the verified user.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to modify Quantum credentials.",
        )

    IBMQuantumCredentialService.delete_user_credentials(user["id"])
    return {
        "configured": False,
        "message": "IBM Quantum credentials removed successfully.",
    }


@router.post("/test", status_code=status.HTTP_200_OK)
def test_credentials(authorization: Optional[str] = Header(None)):
    """
    Tests live connection to IBM Quantum using the user's stored credentials.
    Executes a zero-cost API ping via Qiskit Runtime without launching a circuit job.
    """
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to test Quantum credentials.",
        )

    token, instance = IBMQuantumCredentialService.get_decrypted_token_for_user(user["id"])
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="IBM Quantum is not configured for this account. Add your IBM Quantum credentials in Quantum Settings.",
        )

    test_res = IBMQuantumCredentialService.test_ibm_connection(token, instance)
    if not test_res.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=test_res.get("message", "IBM Quantum connection failed. Please verify your credentials."),
        )

    return test_res
