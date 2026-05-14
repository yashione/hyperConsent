import os

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from auth import get_current_user, login_for_token
from models import ConsentRequest, ConsentResponse, Token, User

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:3001")
DEFAULT_CORS_ORIGINS = ",".join(
    [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
)

app = FastAPI(title="Consent Management API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/system/status")
async def system_status():
    gateway = await gateway_request("GET", "/health")
    return {"api": {"status": "ok"}, "gateway": gateway}


@app.post("/login", response_model=Token)
async def login(token: Token = Depends(login_for_token)):
    return token


async def gateway_request(method: str, path: str, **kwargs):
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10) as client:
        response = await client.request(method, path, **kwargs)
    if response.status_code >= 400:
        detail = response.json().get("detail", "Gateway request failed")
        raise HTTPException(status_code=response.status_code, detail=detail)
    return response.json()


@app.post("/consents", response_model=ConsentResponse)
async def create_consent(
    request: ConsentRequest,
    current_user: User = Depends(get_current_user),
):
    if current_user.username != request.user_id and current_user.username != "admin":
        raise HTTPException(status_code=403, detail="Cannot create consent for another user")
    return await gateway_request("POST", "/consents", json=request.model_dump())


@app.get("/consents/{consent_id}", response_model=ConsentResponse)
async def read_consent(
    consent_id: str,
    _current_user: User = Depends(get_current_user),
):
    return await gateway_request("GET", f"/consents/{consent_id}")


@app.get("/consents/{consent_id}/history", response_model=list[ConsentResponse])
async def read_consent_history(
    consent_id: str,
    _current_user: User = Depends(get_current_user),
):
    return await gateway_request("GET", f"/consents/{consent_id}/history")


@app.get("/consents", response_model=list[ConsentResponse])
async def list_consents(
    user_id: str | None = Query(default=None),
    consumer_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    params = {"user_id": user_id or current_user.username}
    if consumer_id:
        params["consumer_id"] = consumer_id
    if status:
        params["status"] = status
    return await gateway_request("GET", "/consents", params=params)


@app.put("/consents/{consent_id}/revoke", response_model=ConsentResponse)
async def revoke_consent(
    consent_id: str,
    _current_user: User = Depends(get_current_user),
):
    return await gateway_request("PUT", f"/consents/{consent_id}/revoke")
