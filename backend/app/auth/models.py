"""Pydantic schemas for auth endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

UserRole = Literal["credit_officer", "investigator", "auditor", "admin"]

# Server-side default for self-registration. Elevated roles must be granted
# by an already-admin caller through a separate (out-of-scope here) endpoint —
# never via the register payload, which is reachable from the open internet.
DEFAULT_SELF_REGISTER_ROLE: UserRole = "credit_officer"


class UserRegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = DEFAULT_SELF_REGISTER_ROLE


class UserLoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    user_id: str
    email: EmailStr
    role: UserRole
    created_at: datetime
    is_active: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in_seconds: int
