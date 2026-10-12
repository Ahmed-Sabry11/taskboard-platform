from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Task
from app.schemas import TaskCreate, TaskList, TaskRead, TaskStatus, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])

DbSession = Annotated[Session, Depends(get_db)]
# Upper bound matches PostgreSQL's 32-bit integer, so oversized ids are a 422, not a 500.
TaskId = Annotated[int, Path(ge=1, le=2_147_483_647)]


def _get_or_404(db: Session, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    return task


@router.get("", response_model=TaskList)
def list_tasks(
    db: DbSession,
    status_filter: Annotated[TaskStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TaskList:
    query = select(Task)
    count_query = select(func.count()).select_from(Task)
    if status_filter is not None:
        query = query.where(Task.status == status_filter)
        count_query = count_query.where(Task.status == status_filter)

    total = db.scalar(count_query) or 0
    items = db.scalars(
        query.order_by(Task.created_at.desc(), Task.id.desc()).limit(limit).offset(offset)
    ).all()
    return TaskList(items=list(items), total=total, limit=limit, offset=offset)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession) -> Task:
    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: TaskId, db: DbSession) -> Task:
    return _get_or_404(db, task_id)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: TaskId, payload: TaskUpdate, db: DbSession) -> Task:
    task = _get_or_404(db, task_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: TaskId, db: DbSession) -> None:
    task = _get_or_404(db, task_id)
    db.delete(task)
    db.commit()
