# Security Spec: Firestore Rules verification (TDD)

## 1. Data Invariants
- Each user's data is strictly scoped under `/users/{userId}`.
- A user can only read and write their own documents.
- Cross-user reading or writing of private metadata, lessons, or word statistics is forbidden.
- Timestamps must be validated on update/create when applicable.

## 2. Dirty Dozen payloads (Forbidden requests)
- Trying to read user data of user B when authenticated as user A.
- Trying to update user B's stats when authenticated as user A.
- Client attempts to create a word with size greater than 100 characters.
- Client attempts to set an illegal learning status value.
- Client attempts to post lesson info without authentication.
- Client provides system keywords to bypass auth.
- Empty document IDs or ID Poisoning with massive strings.
- Bypassing strict subcollection membership logic.

## 3. Security Rules Draft
We will implement an ABAC rule structure confirming the above boundaries.
