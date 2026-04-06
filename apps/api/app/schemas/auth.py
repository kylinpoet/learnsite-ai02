from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserSummary(BaseModel):
    id: str
    username: str
    display_name: str
    role: str
    roles: list[str] = []


class LoginPayload(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: UserSummary
