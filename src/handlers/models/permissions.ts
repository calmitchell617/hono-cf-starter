export const permissions = [
  // Posts
  'posts:list',
  'posts:view',
  'posts:create',
  'posts:edit',

  // Users
  'users:promote',
] as const

export type Permission = typeof permissions[number]
export type PermissionChecks = Partial<Record<Permission, boolean>>

export function hasPermission(permissions: PermissionChecks, code: Permission): boolean {
  return permissions[code] === true
}
