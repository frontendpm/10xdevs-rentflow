# API Endpoints

## User Management
- **GET /api/users/me** → [get-user-me-implementation-plan.md](get-user-me-implementation-plan.md) - done
- **PATCH /api/users/me** → [patch-user-me-implementation-plan.md](patch-user-me-implementation-plan.md) - done

## Apartment Management
- **GET /api/apartments** → [get-apartments-implementation-plan.md](get-apartments-implementation-plan.md)
- **POST /api/apartments** → [post-apartments-implementation-plan.md](post-apartments-implementation-plan.md)
- **GET /api/apartments/:id** → [get-apartments-id-implementation-plan.md](get-apartments-id-implementation-plan.md)
- **PATCH /api/apartments/:id** → [patch-apartments-id-implementation-plan.md](patch-apartments-id-implementation-plan.md)
- **DELETE /api/apartments/:id** → [delete-apartments-id-implementation-plan.md](delete-apartments-id-implementation-plan.md)
- **GET /api/apartments/:id/summary** → [get-apartments-id-summary-implementation-plan.md](get-apartments-id-summary-implementation-plan.md)

## Invitation Management
- **POST /api/apartments/:id/invitations** → [post-apartments-id-invitations-implementation-plan.md](post-apartments-id-invitations-implementation-plan.md)
- **GET /api/apartments/:id/invitations** → [get-apartments-id-invitations-implementation-plan.md](get-apartments-id-invitations-implementation-plan.md)
- **GET /api/invitations/:token** → [get-invitations-token-implementation-plan.md](get-invitations-token-implementation-plan.md)
- **POST /api/invitations/:token/accept** → [post-invitations-token-accept-implementation-plan.md](post-invitations-token-accept-implementation-plan.md)

## Lease Management
- **GET /api/apartments/:id/lease** → [get-apartments-id-lease-implementation-plan.md](get-apartments-id-lease-implementation-plan.md)
- **POST /api/apartments/:id/lease/end** → [post-apartments-id-lease-end-implementation-plan.md](post-apartments-id-lease-end-implementation-plan.md)
- **GET /api/apartments/:id/leases** → [get-apartments-id-leases-implementation-plan.md](get-apartments-id-leases-implementation-plan.md)

## Charge Management
- **GET /api/apartments/:id/charges** → [get-apartments-id-charges-implementation-plan.md](get-apartments-id-charges-implementation-plan.md)
- **POST /api/apartments/:id/charges** → [post-apartments-id-charges-implementation-plan.md](post-apartments-id-charges-implementation-plan.md)
- **GET /api/charges/:id** → [get-charges-id-implementation-plan.md](get-charges-id-implementation-plan.md)
- **PATCH /api/charges/:id** → [patch-charges-id-implementation-plan.md](patch-charges-id-implementation-plan.md)
- **DELETE /api/charges/:id** → [delete-charges-id-implementation-plan.md](delete-charges-id-implementation-plan.md)
- **POST /api/charges/:id/attachment** → [post-charges-id-attachment-implementation-plan.md](post-charges-id-attachment-implementation-plan.md)
- **DELETE /api/charges/:id/attachment** → [delete-charges-id-attachment-implementation-plan.md](delete-charges-id-attachment-implementation-plan.md)

## Payment Management
- **GET /api/charges/:id/payments** → [get-charges-id-payments-implementation-plan.md](get-charges-id-payments-implementation-plan.md)
- **POST /api/charges/:id/payments** → [post-charges-id-payments-implementation-plan.md](post-charges-id-payments-implementation-plan.md)
- **PATCH /api/payments/:id** → [patch-payments-id-implementation-plan.md](patch-payments-id-implementation-plan.md)
- **DELETE /api/payments/:id** → [delete-payments-id-implementation-plan.md](delete-payments-id-implementation-plan.md)

## Protocol Management
- **GET /api/apartments/:id/protocols/:type** → [get-apartments-id-protocols-type-implementation-plan.md](get-apartments-id-protocols-type-implementation-plan.md)
- **PUT /api/apartments/:id/protocols/:type** → [put-apartments-id-protocols-type-implementation-plan.md](put-apartments-id-protocols-type-implementation-plan.md)
- **POST /api/apartments/:id/protocols/:type/photos** → [post-apartments-id-protocols-type-photos-implementation-plan.md](post-apartments-id-protocols-type-photos-implementation-plan.md)
- **DELETE /api/apartments/:id/protocols/:type/photos/:photoId** → [delete-apartments-id-protocols-type-photos-photoId-implementation-plan.md](delete-apartments-id-protocols-type-photos-photoId-implementation-plan.md)

## Dashboard
- **GET /api/dashboard** → [get-dashboard-implementation-plan.md](get-dashboard-implementation-plan.md)
