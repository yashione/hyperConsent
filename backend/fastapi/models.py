from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Token(BaseModel):
    access_token: str
    token_type: str


class User(BaseModel):
    username: str


class ConsentRequest(BaseModel):
    user_id: str = Field(min_length=1)
    consumer_id: str = Field(min_length=1)
    purpose: str = Field(min_length=1)
    status: Literal["GRANTED", "REVOKED"] = "GRANTED"


class ConsentResponse(ConsentRequest):
    id: str
    consent_id: str
    version: int
    action: Literal["GRANTED", "REVOKED"]
    previous_version_id: str | None = None
    is_latest: bool = True
    created_at: datetime
    updated_at: datetime
