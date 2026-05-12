"""Auth dependencies for protected routes."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from backend.app.auth.jwt import TokenError, decode_access_token
from backend.app.auth.repository import get_user_by_id
from backend.app.deps import get_driver

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise credentials_exc from exc

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_exc

    driver = get_driver()
    user = await get_user_by_id(driver, user_id)
    if user is None or not user.get("is_active", False):
        raise credentials_exc
    return user
