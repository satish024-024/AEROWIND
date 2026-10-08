"""
backend/app/api/auth.py — Authentication Router.

Endpoints:
- POST /api/auth/register : Create new engineer account
- POST /api/auth/login : Authenticate and receive session token
- GET /api/auth/me : Retrieve current user profile
- POST /api/auth/logout : Invalidate session token
"""

from __future__ import annotations

import secrets
import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from backend.app.db import get_db_connection, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username_or_email: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None

    # 1. First check local sessions table
    now = time.time()
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT u.id, u.username, u.email, u.created_at
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at > ?
            """, (token, now))
            row = cursor.fetchone()
            if row:
                res = dict(row)
                res["id"] = str(res["id"])
                res["provider"] = "local"
                return res
    except Exception:
        pass

    # 2. Check Supabase Auth if token looks like a JWT
    if "." in token:
        import os
        import json
        import urllib.request
        supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "https://avtkzutofgsjzldkimro.supabase.co"
        anon_key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if supabase_url and anon_key:
            try:
                url = f"{supabase_url.rstrip('/')}/auth/v1/user"
                req = urllib.request.Request(
                    url,
                    headers={
                        "apikey": anon_key,
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json",
                    },
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        user_id = data.get("id")
                        if user_id:
                            return {
                                "id": str(user_id),
                                "username": (
                                    data.get("user_metadata", {}).get("username")
                                    or (data.get("email", "").split("@")[0] if data.get("email") else str(user_id))
                                ),
                                "email": data.get("email", ""),
                                "created_at": data.get("created_at", ""),
                                "provider": "supabase",
                            }
            except Exception:
                pass

    return None


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    req.username = req.username.strip()
    req.email = req.email.strip().lower()
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (req.username, req.email))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Username or email already registered")

        pwd_hash = hash_password(req.password)
        cursor.execute("""
            INSERT INTO users (username, email, password_hash)
            VALUES (?, ?, ?)
        """, (req.username, req.email, pwd_hash))
        user_id = cursor.lastrowid

        # Generate session token
        token = secrets.token_urlsafe(32)
        expires_at = time.time() + SESSION_TTL_SECONDS
        cursor.execute("""
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, user_id, expires_at))
        conn.commit()

        cursor.execute("SELECT id, username, email, created_at FROM users WHERE id = ?", (user_id,))
        user_data = dict(cursor.fetchone())

    return AuthResponse(token=token, user=UserResponse(**user_data))


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest):
    identity = (req.username_or_email or req.username or req.email or "").strip()
    if not identity:
        raise HTTPException(status_code=400, detail="Username or email is required")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE LOWER(username) = ? OR LOWER(email) = ?
        """, (identity.lower(), identity.lower()))
        user_row = cursor.fetchone()

        user_id = None
        user_data = None

        if user_row and verify_password(req.password, user_row["password_hash"]):
            user_id = user_row["id"]
            user_data = {
                "id": user_row["id"],
                "username": user_row["username"],
                "email": user_row["email"],
                "created_at": user_row["created_at"],
            }
        else:
            # Fallback: check Supabase Auth GoTrue API
            import os
            import json
            import urllib.request
            supabase_url = os.environ.get("SUPABASE_URL") or "https://avtkzutofgsjzldkimro.supabase.co"
            anon_key = os.environ.get("SUPABASE_ANON_KEY")
            sb_user = None
            if supabase_url and anon_key:
                try:
                    auth_url = f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password"
                    payload = json.dumps({"email": identity, "password": req.password}).encode()
                    sb_req = urllib.request.Request(
                        auth_url,
                        data=payload,
                        headers={"apikey": anon_key, "Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(sb_req, timeout=3) as resp:
                        if resp.status == 200:
                            sb_data = json.loads(resp.read().decode())
                            sb_user = sb_data.get("user")
                except Exception:
                    pass

            if not sb_user:
                raise HTTPException(status_code=401, detail="Invalid username/email or password")

            # Provision / sync local user record from Supabase
            sb_email = sb_user.get("email", identity)
            sb_uname = sb_user.get("user_metadata", {}).get("username") or sb_email.split("@")[0]
            pwd_hash = hash_password(req.password)
            if user_row:
                cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, user_row["id"]))
                user_id = user_row["id"]
                cursor.execute("SELECT id, username, email, created_at FROM users WHERE id = ?", (user_id,))
                user_data = dict(cursor.fetchone())
            else:
                cursor.execute("""
                    INSERT INTO users (username, email, password_hash)
                    VALUES (?, ?, ?)
                """, (sb_uname, sb_email, pwd_hash))
                user_id = cursor.lastrowid
                cursor.execute("SELECT id, username, email, created_at FROM users WHERE id = ?", (user_id,))
                user_data = dict(cursor.fetchone())

        token = secrets.token_urlsafe(32)
        expires_at = time.time() + SESSION_TTL_SECONDS
        cursor.execute("""
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, user_id, expires_at))
        conn.commit()

    return AuthResponse(token=token, user=UserResponse(**user_data))


@router.get("/me", response_model=UserResponse)
def get_me(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return UserResponse(**user)


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        with get_db_connection() as conn:
            conn.cursor().execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
    return {"message": "Logged out successfully"}
