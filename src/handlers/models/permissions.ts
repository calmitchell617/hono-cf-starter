export type Permission = 'snippets:list' | 'snippets:view' | 'snippets:create' | 'snippets:edit' | 'users:promote'
export type PermissionChecks = Partial<Record<Permission, boolean>>

export function hasPermission(permissions: PermissionChecks, code: Permission): boolean {
  return permissions[code] === true
}
