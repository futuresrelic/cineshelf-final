# CineShelf Application Architecture & Flowcharts

**Version:** 2.2.15
**Date:** 2026-02-09
**Purpose:** Visual reference for application structure, data flow, and user workflows

---

## 📑 Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema Relationships](#database-schema-relationships)
3. [User Workflows](#user-workflows)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Component Hierarchy](#component-hierarchy)
6. [API Request Flow](#api-request-flow)
7. [State Management](#state-management)

---

## System Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CineShelf Application                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Frontend (SPA)                            │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  index.html                                          │   │    │
│  │  │  ├─ Navigation Tabs (Collection, Wishlist, etc.)    │   │    │
│  │  │  ├─ Tab Content Containers                          │   │    │
│  │  │  └─ Modals (Details, Edit, Create)                  │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                           │                                  │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  JavaScript (app.js, trivia.js, cover-scanner.js)   │   │    │
│  │  │  ├─ State Management (currentUser, collection, etc.)│   │    │
│  │  │  ├─ API Calls (fetch to /api/api.php)               │   │    │
│  │  │  ├─ DOM Manipulation                                │   │    │
│  │  │  └─ Event Handlers                                  │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                           │                                  │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  CSS (styles.css)                                    │   │    │
│  │  │  ├─ Dark theme by default                           │   │    │
│  │  │  ├─ Responsive grid/list layouts                    │   │    │
│  │  │  └─ Modal styling                                   │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                    │                                 │
│                                    │ HTTP POST (JSON)                │
│                                    ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Backend (PHP)                            │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  /api/api.php (Main API Router)                     │   │    │
│  │  │  ├─ Route based on 'action' parameter               │   │    │
│  │  │  ├─ Session validation                              │   │    │
│  │  │  ├─ Input sanitization                              │   │    │
│  │  │  └─ JSON response generation                        │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                           │                                  │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  /config/config.php                                 │   │    │
│  │  │  ├─ Database connection (getDb())                   │   │    │
│  │  │  ├─ Constants (TMDB_API_KEY, etc.)                  │   │    │
│  │  │  ├─ Utility functions (sanitize, jsonResponse)      │   │    │
│  │  │  └─ PRAGMA settings (WAL mode, cache, etc.)        │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                           │                                  │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  /config/oauth-config.php                           │   │    │
│  │  │  └─ Google OAuth credentials & settings             │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                    │                                 │
│                                    ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                Database (SQLite)                             │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │  /data/cineshelf.sqlite                             │   │    │
│  │  │  ├─ Core Tables:                                    │   │    │
│  │  │  │  ├─ users                                        │   │    │
│  │  │  │  ├─ movies                                       │   │    │
│  │  │  │  ├─ copies                                       │   │    │
│  │  │  │  ├─ wishlist                                     │   │    │
│  │  │  │  └─ unresolved_copies                            │   │    │
│  │  │  ├─ Shelf System:                                   │   │    │
│  │  │  │  ├─ shelves                                      │   │    │
│  │  │  │  └─ shelf_assignments                            │   │    │
│  │  │  ├─ Box Set System:                                 │   │    │
│  │  │  │  ├─ containers                                   │   │    │
│  │  │  │  └─ container_contents                           │   │    │
│  │  │  ├─ Group System:                                   │   │    │
│  │  │  │  ├─ groups                                       │   │    │
│  │  │  │  ├─ group_members                                │   │    │
│  │  │  │  ├─ group_invites                                │   │    │
│  │  │  │  └─ borrows                                      │   │    │
│  │  │  └─ Supporting Tables:                              │   │    │
│  │  │     ├─ sessions                                     │   │    │
│  │  │     ├─ trivia_sessions                              │   │    │
│  │  │     ├─ trivia_questions                             │   │    │
│  │  │     └─ audit_log                                    │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  External APIs                               │    │
│  │  ┌──────────────────┐  ┌──────────────────┐                │    │
│  │  │  TMDB API        │  │  OpenAI Vision   │                │    │
│  │  │  ├─ Movie search │  │  ├─ Cover scan   │                │    │
│  │  │  ├─ Metadata     │  │  └─ Title recog  │                │    │
│  │  │  └─ Posters      │  └──────────────────┘                │    │
│  │  └──────────────────┘                                        │    │
│  │  ┌──────────────────┐                                        │    │
│  │  │  Google OAuth    │                                        │    │
│  │  │  ├─ Login        │                                        │    │
│  │  │  └─ User info    │                                        │    │
│  │  └──────────────────┘                                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Relationships

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Database Relationships                         │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │    users     │
                    │──────────────│
                    │ id (PK)      │
                    │ username     │
                    │ email        │
                    │ google_id    │
                    │ display_name │
                    │ is_admin     │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┬───────────────┐
           │               │               │               │
           ▼               ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐   ┌──────────┐   ┌──────────────┐
    │  copies  │    │ wishlist │   │ shelves  │   │ containers   │
    │──────────│    │──────────│   │──────────│   │──────────────│
    │ id (PK)  │    │ id (PK)  │   │ id (PK)  │   │ id (PK)      │
    │ user_id  │    │ user_id  │   │ user_id  │   │ user_id      │
    │ movie_id │◄─┐ │ movie_id │◄┐ │ name     │   │ name         │
    │ format   │  │ │ priority │ │ │ color    │   │ format       │
    │ edition  │  │ └──────────┘ │ │ icon     │   │ spine_label  │
    │ region   │  │              │ └────┬─────┘   └──────┬───────┘
    │ condition│  │              │      │                 │
    └────┬─────┘  │              │      ▼                 ▼
         │        │              │ ┌────────────────┐ ┌────────────────┐
         │        │              │ │shelf_assignments│container_contents│
         │        │              │ │────────────────│ │────────────────│
         │        │              │ │ id (PK)        │ │ id (PK)        │
         │        │              │ │ shelf_id (FK)  │ │ container_id FK│
         │        │              │ │ copy_id (FK) ──┼─┤ copy_id (FK) ──┤
         │        │              │ │ position       │ │ disc_number    │
         │        │              │ │ container_id FK│ │ is_present     │
         │        │              │ └────────────────┘ └────────────────┘
         │        │              │
         └────────┼──────────────┘
                  │
                  ▼
         ┌──────────────┐
         │    movies    │
         │──────────────│
         │ id (PK)      │
         │ tmdb_id (UK) │
         │ title        │
         │ year         │
         │ director     │
         │ actors       │
         │ studio       │
         │ genre        │
         │ poster_url   │
         │ backdrop_url │
         │ overview     │
         └──────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                       Group System                                │
└──────────────────────────────────────────────────────────────────┘

         ┌──────────────┐
         │    users     │
         └──────┬───────┘
                │
                ├─────────────┐
                │             │
                ▼             ▼
         ┌──────────┐  ┌──────────────┐
         │  groups  │  │group_members │
         │──────────│  │──────────────│
         │ id (PK)  │◄─┤ group_id (FK)│
         │created_by│  │ user_id (FK) │
         │ name     │  │ role         │
         └────┬─────┘  └──────────────┘
              │
              ▼
      ┌───────────────┐
      │group_invites  │
      │───────────────│
      │ id (PK)       │
      │ group_id (FK) │
      │ invited_email │
      │ token         │
      │ expires_at    │
      └───────────────┘

      ┌───────────────┐
      │   borrows     │
      │───────────────│
      │ id (PK)       │
      │ copy_id (FK)  │
      │ owner_id (FK) │
      │ borrower_id FK│
      │ due_date      │
      │ returned_at   │
      └───────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     Key Relationships                             │
└──────────────────────────────────────────────────────────────────┘

1. users (1) ──< (many) copies
2. users (1) ──< (many) wishlist
3. users (1) ──< (many) shelves
4. users (1) ──< (many) containers
5. movies (1) ──< (many) copies
6. movies (1) ──< (many) wishlist
7. copies (1) ──< (1) shelf_assignments
8. copies (1) ──< (1) container_contents
9. shelves (1) ──< (many) shelf_assignments
10. containers (1) ──< (many) container_contents
11. shelves (1) ──< (many) shelves (hierarchical via parent_shelf_id)
```

---

## User Workflows

### 1. User Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authentication Flow                           │
└─────────────────────────────────────────────────────────────────┘

User Opens App
      │
      ▼
┌─────────────────┐
│ index.html loads│
└────────┬────────┘
         │
         ▼
┌──────────────────────────┐
│ Check localStorage for   │
│ 'cineshelf_auth_token'   │
└────────┬─────────────────┘
         │
         ├─── Token exists? ────┐
         │                       │
         ▼ YES                   ▼ NO
┌───────────────────┐    ┌────────────────┐
│ Validate session  │    │ Show login page│
│ POST: verify_session│   └────────┬───────┘
└────────┬──────────┘             │
         │                        ▼
         ▼              ┌──────────────────────┐
    Valid?             │ User clicks          │
         │             │ "Sign in with Google"│
         ├─YES─────────┤                      │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Redirect to Google   │
         │             │ OAuth consent screen │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ User grants permission│
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Redirect to          │
         │             │ /api/auth.php        │
         │             │ with auth code       │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Exchange code for    │
         │             │ access token         │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Fetch user info from │
         │             │ Google (email, name) │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Create/update user   │
         │             │ in database          │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Generate session     │
         │             │ token (UUID)         │
         │             │ Store in sessions    │
         │             └──────────┬───────────┘
         │                        │
         │                        ▼
         │             ┌──────────────────────┐
         │             │ Set localStorage     │
         │             │ 'cineshelf_auth_token'│
         │             └──────────┬───────────┘
         │                        │
         └────────────────────────┘
                      │
                      ▼
         ┌──────────────────────┐
         │ Load main app UI     │
         │ Fetch user collection│
         └──────────────────────┘
```

### 2. Adding a Movie to Collection

```
┌─────────────────────────────────────────────────────────────────┐
│                Add Movie Workflow                                │
└─────────────────────────────────────────────────────────────────┘

User clicks "Add" tab
         │
         ▼
┌────────────────────┐
│ Choose Add Type:   │
│ ○ Single Movie     │
│ ○ Box Set          │
└─────────┬──────────┘
          │
          ├──── Box Set? ────┐
          │                  │
          ▼ NO               ▼ YES
┌──────────────────┐   [See Box Set Flow]
│ User clicks      │
│ "Add Single Movie│
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ Search modal     │
│ appears          │
└─────────┬────────┘
          │
          ▼
┌──────────────────────────┐
│ User types movie title   │
│ e.g., "Inception"        │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Frontend debounced search│
│ (300ms delay)            │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ POST: search_tmdb        │
│ { query: "Inception" }   │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Backend queries TMDB API:│
│ GET /search/movie?       │
│ query=Inception          │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Return top 10 results    │
│ with posters, year       │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Display results in UI    │
│ [🎬 Inception (2010)]    │
│ [🎬 Inception: Cobol...] │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ User clicks correct movie│
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ Form appears with fields:│
│ ├─ Format: [Blu-ray ▼]  │
│ ├─ Edition: [_________ ] │
│ ├─ Region: [Region A ▼] │
│ ├─ Condition: [Mint ▼]  │
│ ├─ Purchase Date: [___] │
│ ├─ Purchase Price: [__] │
│ └─ Notes: [___________] │
└─────────┬────────────────┘
          │
          ▼
┌──────────────────────────┐
│ User fills form and      │
│ clicks "Add to Collection"│
└─────────┬────────────────┘
          │
          ▼
┌───────────────────────────┐
│ POST: add_to_collection   │
│ { tmdb_id, format, etc. } │
└─────────┬─────────────────┘
          │
          ▼
┌───────────────────────────┐
│ Backend processes:        │
│ 1. Check if movie exists  │
│    in movies table        │
└─────────┬─────────────────┘
          │
          ├─ Exists? ─┐
          │           │
          ▼ NO        ▼ YES
┌───────────────────┐ Skip
│ Fetch full movie  │
│ details from TMDB:│
│ ├─ Title          │
│ ├─ Year           │
│ ├─ Director       │
│ ├─ Actors (top 5) │
│ ├─ Studio         │
│ ├─ Genres         │
│ ├─ Runtime        │
│ ├─ Rating         │
│ ├─ Poster URL     │
│ └─ Overview       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ INSERT INTO movies│
└─────────┬─────────┘
          │
          └──────────┬
                     │
                     ▼
          ┌────────────────────┐
          │ INSERT INTO copies │
          │ (user_id, movie_id,│
          │  format, etc.)     │
          └──────────┬─────────┘
                     │
                     ▼
          ┌────────────────────┐
          │ Return success     │
          │ { ok: true,        │
          │   copy_id: 123 }   │
          └──────────┬─────────┘
                     │
                     ▼
          ┌────────────────────┐
          │ Frontend refreshes │
          │ collection view    │
          └──────────┬─────────┘
                     │
                     ▼
          ┌────────────────────┐
          │ Show success toast │
          │ "Movie added!"     │
          └────────────────────┘
```

### 3. Creating a Box Set

```
┌─────────────────────────────────────────────────────────────────┐
│                   Box Set Creation Flow                          │
└─────────────────────────────────────────────────────────────────┘

User clicks "Add" tab → "Add Box Set"
              │
              ▼
    ┌──────────────────────┐
    │ STEP 1: Box Set Info │
    ├──────────────────────┤
    │ Name: [___________]  │
    │ Spine Label: [_____] │
    │ Format: [Blu-ray ▼] │
    │ Condition: [Mint ▼] │
    │ Notes: [___________] │
    └───────────┬──────────┘
                │
                ▼
    ┌─────────────────────────┐
    │ User clicks "Create Box"│
    │ Set"                    │
    └───────────┬─────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ POST: create_container   │
    │ { name, spine_label,     │
    │   format, condition, ... }│
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ Backend:                 │
    │ INSERT INTO containers   │
    │ RETURN container_id      │
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ Store currentContainerId │
    │ Show STEP 2              │
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ STEP 2: Add Movies       │
    ├──────────────────────────┤
    │ 📦 The Matrix Trilogy    │
    │ ────────────────────────│
    │ Search: [matrix_______]🔍│
    │                          │
    │ Movies in this box set:  │
    │ [Empty - add movies]     │
    │                          │
    │ [View Box Set Details]   │
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ User searches "matrix"   │
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ Display TMDB results     │
    │ ┌──────────────────────┐ │
    │ │ The Matrix (1999)    │ │
    │ │ [Add to Box Set]     │ │
    │ ├──────────────────────┤ │
    │ │ Matrix Reloaded 2003 │ │
    │ │ [Add to Box Set]     │ │
    │ └──────────────────────┘ │
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────┐
    │ User clicks "Add to Box" │
    │ Set" on first movie      │
    └───────────┬──────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Call: get_or_create_movie    │
    │ { tmdb_id: 603 }             │
    │ Returns: movie_id            │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Call: add_copy               │
    │ { movie_id, format, etc. }   │
    │ Returns: copy_id             │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Call: add_movie_to_container │
    │ { container_id,              │
    │   copy_id,                   │
    │   disc_number: 1 }           │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Backend:                     │
    │ INSERT INTO container_contents│
    │ (container_id, copy_id,      │
    │  disc_number)                │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Frontend updates local array:│
    │ boxSetMovies.push({          │
    │   movie_id, title, poster_url│
    │   disc_number: 1             │
    │ })                           │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Update UI with movie card:   │
    │ ┌──────────────────────────┐ │
    │ │ [Poster]                 │ │
    │ │ The Matrix (1999)        │ │
    │ │ Disc 1                   │ │
    │ │ [Remove]                 │ │
    │ └──────────────────────────┘ │
    │                              │
    │ Movie count: 1               │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ User repeats for             │
    │ Matrix Reloaded, Revolutions │
    │ (search → add → update)      │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Box set now shows:           │
    │ ┌──────────────────────────┐ │
    │ │ 1. The Matrix (1999)     │ │
    │ │ 2. Matrix Reloaded (2003)│ │
    │ │ 3. Matrix Revolutions(03)│ │
    │ └──────────────────────────┘ │
    │ Movie count: 3               │
    │                              │
    │ [View Box Set Details]       │
    │ [Done]                       │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ User clicks "Done" or        │
    │ navigates to Collection tab  │
    └───────────┬──────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │ Box set created successfully!│
    │ Movies appear in Collection  │
    │ with 📦 badge                │
    └──────────────────────────────┘
```

### 4. Shelf Management Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                  Shelf Assignment Flow                           │
└─────────────────────────────────────────────────────────────────┘

User clicks "Shelves" tab
         │
         ▼
┌──────────────────────┐
│ List of shelves      │
│ ┌──────────────────┐ │
│ │ 📚 Living Room   │ │
│ │ 🎬 Kubrick Shelf │ │
│ │ 🏰 Disney        │ │
│ └──────────────────┘ │
│ [Create New Shelf]   │
└─────────┬────────────┘
          │
          ├─── Create New? ────┐
          │                    │
          ▼ NO                 ▼ YES
┌──────────────────┐   ┌────────────────┐
│ Click shelf to   │   │ Fill form:     │
│ view contents    │   │ ├─ Name        │
└─────────┬────────┘   │ ├─ Color       │
          │            │ └─ Icon        │
          │            │ [Create]       │
          │            └────────┬───────┘
          │                     │
          │                     ▼
          │            ┌────────────────┐
          │            │ POST:          │
          │            │ create_shelf   │
          │            └────────┬───────┘
          │                     │
          └─────────────────────┘
                     │
                     ▼
          ┌────────────────────┐
          │ Shelf Contents View│
          ├────────────────────┤
          │ 📚 Living Room     │
          │ (15 movies)        │
          │                    │
          │ [Poster] [Poster]  │
          │ [Poster] [Poster]  │
          │                    │
          │ [Add Movies to     │
          │  this Shelf]       │
          └─────────┬──────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ Unassigned Movies Modal│
          ├────────────────────────┤
          │ Filter by:             │
          │ ├─ Director [All ▼]    │
          │ ├─ Genre [All ▼]       │
          │ └─ Studio [All ▼]      │
          │ Sort by: [Title ▼]     │
          │                        │
          │ [☐ Movie 1] [Poster]   │
          │ [☐ Movie 2] [Poster]   │
          │ [☐ Movie 3] [Poster]   │
          │                        │
          │ [Select All]           │
          │ [Deselect All]         │
          │ [Assign Selected (0)]  │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ User applies filters:  │
          │ Director: "Kubrick"    │
          │ Genre: "Sci-Fi"        │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ Filtered results:      │
          │ ☐ 2001: A Space Odyssey│
          │ ☐ A Clockwork Orange   │
          │ ☐ The Shining (no - not Sci-Fi)
          │ → Only 2 movies match  │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ User clicks "Select All"│
          │ → Both movies checked  │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ User clicks "Assign    │
          │ Selected (2)"          │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ For each selected:     │
          │ POST: assign_to_shelf  │
          │ { shelf_id, copy_id }  │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ Backend:               │
          │ INSERT INTO            │
          │ shelf_assignments      │
          │ (shelf_id, copy_id)    │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ Success toast:         │
          │ "2 movies assigned to  │
          │  Living Room shelf"    │
          └─────────┬──────────────┘
                    │
                    ▼
          ┌────────────────────────┐
          │ Refresh shelf contents │
          │ Show 17 movies now     │
          │ (was 15, added 2)      │
          └────────────────────────┘
```

---

## Data Flow Diagrams

### API Request/Response Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    API Request Flow                              │
└─────────────────────────────────────────────────────────────────┘

Frontend (app.js)                Backend (/api/api.php)
─────────────────                ────────────────────────

┌──────────────────┐
│ User Action      │
│ (e.g., click     │
│  "Add Movie")    │
└─────────┬────────┘
          │
          ▼
┌──────────────────────┐
│ Event Handler        │
│ addToCollection()    │
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐
│ Prepare request data:│
│ {                    │
│   action: "add_to_   │
│            collection│
│   tmdb_id: 603,      │
│   format: "Blu-ray", │
│   ...                │
│ }                    │
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐
│ fetch('/api/api.php',│
│   {                  │
│     method: 'POST',  │
│     headers: {       │
│       'Content-Type':│
│       'application/  │
│        json'         │
│     },               │
│     body: JSON.      │
│       stringify(data)│
│   }                  │
│ )                    │
└─────────┬────────────┘
          │
          │ HTTP POST
          │ (JSON payload)
          ▼
                         ┌──────────────────────┐
                         │ Receive POST request │
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Parse JSON body      │
                         │ $input = json_decode │
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Extract 'action'     │
                         │ $action = $input     │
                         │   ['action']         │
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Route to handler:    │
                         │ switch ($action) {   │
                         │   case 'add_to_      │
                         │     collection':     │
                         │     // handle        │
                         │ }                    │
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Validate session:    │
                         │ Check auth_token in  │
                         │ sessions table       │
                         └─────────┬────────────┘
                                   │
                                   ├─ Valid? ──┐
                                   │           │
                                   ▼ YES       ▼ NO
                         ┌─────────────┐ ┌─────────────┐
                         │ Continue    │ │ Return 401  │
                         └──────┬──────┘ │ Unauthorized│
                                │        └─────────────┘
                                ▼
                         ┌──────────────────────┐
                         │ Sanitize inputs:     │
                         │ $tmdbId = sanitize   │
                         │   ($input['tmdb_id'])│
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Execute business     │
                         │ logic:               │
                         │ 1. Check if movie    │
                         │    exists            │
                         │ 2. Fetch from TMDB   │
                         │    if needed         │
                         │ 3. Insert movie      │
                         │ 4. Insert copy       │
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Prepare response:    │
                         │ jsonResponse(        │
                         │   true,              │
                         │   ['copy_id' => $id],│
                         │   null               │
                         │ )                    │
                         └─────────┬────────────┘
                                   │
                                   ▼
                         ┌──────────────────────┐
                         │ Send JSON response:  │
                         │ {                    │
                         │   "ok": true,        │
                         │   "data": {          │
                         │     "copy_id": 123   │
                         │   },                 │
                         │   "error": null      │
                         │ }                    │
                         └─────────┬────────────┘
                                   │
          ┌────────────────────────┘
          │ HTTP 200 OK
          │ (JSON response)
          ▼
┌──────────────────────┐
│ .then(r => r.json()) │
└─────────┬────────────┘
          │
          ▼
┌──────────────────────┐
│ Check result.ok      │
└─────────┬────────────┘
          │
          ├─ OK? ──┐
          │        │
          ▼ YES    ▼ NO
┌─────────────┐ ┌──────────────┐
│ Success     │ │ Show error   │
│ handling:   │ │ toast:       │
│ - Refresh   │ │ "Failed to   │
│   collection│ │  add movie"  │
│ - Show toast│ └──────────────┘
│ - Close form│
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│ UI updated           │
│ User sees new movie  │
└──────────────────────┘
```

---

## Component Hierarchy

### Frontend Component Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend Components                          │
└─────────────────────────────────────────────────────────────────┘

index.html
│
├── <head>
│   ├── <meta> tags (viewport, charset, etc.)
│   ├── <link rel="manifest"> → manifest.php
│   ├── <link rel="stylesheet"> → css/styles.css?v=2.2.15
│   └── Service Worker registration
│
├── <body>
│   ├── Header
│   │   ├── Logo/Title
│   │   ├── User Profile (avatar, name)
│   │   └── Logout button
│   │
│   ├── Navigation Tabs (icon-only)
│   │   ├── 📚 Collection tab
│   │   ├── ❤️ Wishlist tab
│   │   ├── 👨‍👩‍👧‍👦 Groups tab
│   │   ├── 📚 Shelves tab
│   │   ├── ➕ Add tab
│   │   ├── 🎮 Trivia tab
│   │   ├── 🔍 Resolve tab (admin only)
│   │   └── ⚙️ Settings tab
│   │
│   ├── Tab Content Containers
│   │   │
│   │   ├── #collectionTab
│   │   │   ├── Controls
│   │   │   │   ├── Search input
│   │   │   │   ├── Shelf filter dropdown
│   │   │   │   ├── Sort dropdown
│   │   │   │   └── View toggle (grid/list)
│   │   │   ├── Stats (count, formats)
│   │   │   └── Movie Grid/List
│   │   │       └── Movie Cards (dynamically rendered)
│   │   │
│   │   ├── #wishlistTab
│   │   │   ├── Search/Filter
│   │   │   └── Wishlist Items
│   │   │
│   │   ├── #groupsTab
│   │   │   ├── Group list
│   │   │   ├── Create group button
│   │   │   └── Group details view
│   │   │
│   │   ├── #shelvesTab
│   │   │   ├── View toggle (list/visual)
│   │   │   ├── Shelf list view
│   │   │   │   └── Shelf cards
│   │   │   └── Shelf visual view
│   │   │       └── Spine representations
│   │   │
│   │   ├── #addTab
│   │   │   ├── Add Type Choice
│   │   │   │   ├── Add Single Movie button
│   │   │   │   └── Add Box Set button
│   │   │   ├── Single Movie Section
│   │   │   │   ├── TMDB search
│   │   │   │   └── Add form
│   │   │   └── Box Set Section
│   │   │       ├── Step 1: Create container
│   │   │       └── Step 2: Add movies
│   │   │           ├── Search movies
│   │   │           ├── Movies list
│   │   │           └── View details button
│   │   │
│   │   ├── #triviaTab
│   │   │   ├── Game mode selection
│   │   │   ├── Start game button
│   │   │   ├── Question display
│   │   │   ├── Answer options
│   │   │   └── Score/stats
│   │   │
│   │   ├── #resolveTab (admin only)
│   │   │   ├── Unresolved copies list
│   │   │   └── TMDB match interface
│   │   │
│   │   └── #settingsTab
│   │       ├── Profile settings
│   │       ├── View preferences
│   │       ├── Export data button
│   │       └── Import data button
│   │
│   ├── Modals (hidden by default, .active to show)
│   │   │
│   │   ├── #movieDetailsModal
│   │   │   ├── Movie poster
│   │   │   ├── Movie metadata
│   │   │   ├── Copy details
│   │   │   ├── Edit button
│   │   │   └── Delete button
│   │   │
│   │   ├── #editMovieModal
│   │   │   ├── Edit form fields
│   │   │   ├── Save button
│   │   │   └── Cancel button
│   │   │
│   │   ├── #shelfDetailsModal
│   │   │   ├── Shelf info
│   │   │   ├── Movies in shelf
│   │   │   ├── Add movies button
│   │   │   └── Edit/delete buttons
│   │   │
│   │   ├── #boxSetDetailsModal
│   │   │   ├── Box set name/format
│   │   │   ├── Movies in box set
│   │   │   ├── Movie count
│   │   │   ├── Edit button
│   │   │   └── Delete button
│   │   │
│   │   └── #unassignedMoviesModal
│   │       ├── Filter controls
│   │       ├── Sort dropdown
│   │       ├── Search input
│   │       ├── Movie grid (checkboxes)
│   │       ├── Select all/deselect all
│   │       └── Assign selected button
│   │
│   └── JavaScript Load Order
│       ├── 1. Fetch /get-version.php
│       ├── 2. Load app.js?v=2.2.15
│       ├── 3. Load trivia.js?v=2.2.15
│       ├── 4. Load cover-scanner.js?v=2.2.15
│       └── 5. Call init() on DOM ready
│
└── </body>
```

---

## State Management

### Global State Variables (app.js)

```
┌─────────────────────────────────────────────────────────────────┐
│                     State Management                             │
└─────────────────────────────────────────────────────────────────┘

Global Variables in app.js:
────────────────────────────

// User Authentication
let currentUser = null;
  ├─ Structure: { id, username, email, display_name, avatar_url, is_admin }
  ├─ Set on: Login, session validation
  └─ Used in: All API calls, UI rendering

// Collection Data
let collection = [];
  ├─ Structure: Array of { movie: {...}, copies: [{...}] }
  ├─ Set on: loadCollection()
  └─ Used in: Collection tab rendering, search, filter

let originalCollection = [];
  ├─ Structure: Same as collection
  ├─ Purpose: Preserve original before filtering
  └─ Used in: Reset filters

// Wishlist Data
let wishlist = [];
  ├─ Structure: Array of { movie: {...}, priority, notes }
  ├─ Set on: loadWishlist()
  └─ Used in: Wishlist tab rendering

// Shelf Management
let shelves = [];
  ├─ Structure: Array of { id, name, color, icon, parent_shelf_id }
  ├─ Set on: loadShelves()
  └─ Used in: Shelves tab, shelf filter dropdown

let unassignedMovies = [];
  ├─ Structure: Array of { copy_id, movie: {...}, format, ... }
  ├─ Set on: Opening unassigned movies modal
  └─ Used in: Shelf assignment flow

let filteredUnassignedMovies = [];
  ├─ Purpose: Track currently filtered unassigned movies
  └─ Used in: "Select All" to only select visible movies

let selectedCopyIds = new Set();
  ├─ Purpose: Track which copies are selected for shelf assignment
  └─ Used in: Multi-select checkboxes

// Box Set Management
let currentContainerId = null;
  ├─ Purpose: Track active box set being created/edited
  ├─ Set on: create_container, editBoxSet()
  ├─ Cleared on: Navigating away (unless in creation mode)
  └─ Critical: Must persist during creation flow

let currentContainer = null;
  ├─ Structure: { id, name, format, spine_label, ... }
  ├─ Purpose: Full container data object
  └─ Used in: Edit mode, details modal

let boxSetMovies = [];
  ├─ Structure: Array of { movie_id, title, poster_url, disc_number, ... }
  ├─ Purpose: Local cache of movies added to current box set
  ├─ Updated on: Adding/removing movies during creation
  └─ Used in: Rendering movie list in Step 2

// UI State
let currentTab = 'collection';
  ├─ Purpose: Track active tab
  └─ Used in: Tab switching, conditional rendering

let currentView = 'grid'; // or 'list'
  ├─ Purpose: Track collection view mode
  └─ Used in: renderCollection()

let shelfView = 'list'; // or 'visual'
  ├─ Purpose: Track shelf view mode
  └─ Used in: renderShelves()

// Filters
let collectionFilters = {
    search: '',
    format: 'all',
    genre: 'all',
    shelf: null  // shelf_id or null
};
  └─ Used in: Filtering collection

let unassignedFilter = {
    search: '',
    sort: 'title',
    director: 'all',
    genre: 'all',
    studio: 'all'
};
  └─ Used in: Filtering unassigned movies

// Trivia Game
let triviaSession = null;
  ├─ Structure: { session_id, questions: [...], score, ... }
  └─ Used in: Trivia tab

// Cover Scanner
let scanList = [];
  ├─ Structure: Array of { id, title, timestamp }
  ├─ Persisted in: localStorage
  └─ Used in: Batch scanning flow


State Lifecycle:
────────────────

┌──────────────┐
│ Page Load    │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ Check localStorage   │
│ for auth_token       │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Validate session     │
│ Set currentUser      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ init()               │
│ ├─ loadCollection()  │
│ ├─ loadWishlist()    │
│ ├─ loadShelves()     │
│ └─ switchTab('       │
│    collection')      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ User Interacts       │
│ (clicks, types, etc.)│
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Event Handler        │
│ ├─ Update state      │
│ ├─ API call (if      │
│ │   needed)          │
│ └─ Re-render UI      │
└──────────────────────┘


Critical State Patterns:
────────────────────────

1. Box Set State Preservation:

   function closeBoxSetDetails() {
       // Check if in creation mode before clearing
       const step2 = document.getElementById('boxSetStep2');
       const isCreating = step2 && step2.style.display !== 'none';

       if (!isCreating) {
           currentContainerId = null;
           currentContainer = null;
       }
   }

2. Filter State Management:

   async function filterByShelf() {
       const shelfId = document.getElementById('shelfFilter').value;
       collectionFilters.shelf = shelfId || null;

       if (!shelfId) {
           collection = [...originalCollection];
       } else {
           // Fetch shelf contents and filter
       }

       renderCollection();
   }

3. Multi-Select State:

   function toggleMovieSelection(copyId) {
       if (selectedCopyIds.has(copyId)) {
           selectedCopyIds.delete(copyId);
       } else {
           selectedCopyIds.add(copyId);
       }
       renderUnassignedMovies();
   }
```

---

## Version Management & Cache Busting

```
┌─────────────────────────────────────────────────────────────────┐
│              Version Management Flow                             │
└─────────────────────────────────────────────────────────────────┘

/version.json
├─ { "version": "2.2.15", "updated": "2026-02-09..." }
└─ Single source of truth

         │
         ├─────────────────┬─────────────────┬──────────────────
         │                 │                 │
         ▼                 ▼                 ▼
/manifest.php      /get-version.php     index.html
├─ Reads version   ├─ API endpoint     ├─ Script loader
├─ Adds ?v= to     └─ Returns JSON     └─ Appends ?v= to
│  icon URLs                               all JS/CSS files
│
│  icons: [
│    {
│      src: "/app-icon.png?v=2.2.15"
│    }
│  ]
│
└─ PWA refreshes icons when version changes


User Opens App:
───────────────

1. Browser loads index.html
2. index.html fetches /get-version.php
3. Compare with localStorage['cineshelf-version']
4. If different:
   ├─ Show 🔄 "Update Available" button
   └─ User clicks → Force reload:
       ├─ Unregister service workers
       ├─ Clear all caches
       ├─ Update localStorage version
       └─ Hard reload page

5. Load scripts with version:
   ├─ /js/app.js?v=2.2.15
   ├─ /js/trivia.js?v=2.2.15
   └─ /js/cover-scanner.js?v=2.2.15

6. Browser caches new versions


Bumping Version:
────────────────

Developer visits: /admin/bump-version.php
         │
         ▼
Read /version.json
         │
         ▼
Increment patch: 2.2.14 → 2.2.15
         │
         ▼
Write back to /version.json
         │
         ▼
Next user visit:
├─ Detects version mismatch
├─ Shows update button
└─ Clears cache on update
```

---

**End of Architecture Documentation**

*This document provides a comprehensive visual reference for the CineShelf application structure, data flow, and user workflows. For implementation details, see DEV_GUIDE.md. For user instructions, see USER_GUIDE.md.*
