/**
 * Task comments are stored in the request's form data under one key per task, so a later approver
 * cannot overwrite an earlier approver's comment (task data is merged into the form).
 */
const PREFIX = 'comment_';

export function commentKey(taskId: string): string {
  return PREFIX + taskId;
}

export function isCommentKey(key: string): boolean {
  return key.startsWith(PREFIX);
}
