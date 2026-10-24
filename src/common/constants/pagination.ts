/**
 * Page sizes shared between a repository and its in-memory double.
 *
 * The users list and search were paginated by a literal `20` written out in
 * both `PrismaUsersRepository` and `InMemoryUsersRepository`. Two copies of a
 * page size is one edit away from a double that pages differently from the
 * database it stands in for — and the shared repository contract would keep
 * passing, because both sides would still be internally consistent.
 */
export const USERS_PAGE_SIZE = 20
