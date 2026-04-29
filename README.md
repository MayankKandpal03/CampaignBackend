# Introduction

This app is built for **digital marketing or operations teams** inside a company — where multiple departments need to coordinate campaign execution without stepping on each other.

### Roles

### 🟦 PPC (Pay-Per-Click Executive)

The **campaign creator** on the ground level.

- Creates campaign requests with a message and requested time
- Can edit or cancel their campaign **before** the task is sent to IT
- Tracks the status of their submissions in real time

---

### 🟨 Manager

The **team lead** who oversees their PPC members.

- Creates campaigns themselves OR monitors campaigns created by their PPC team
- Can add or remove PPC members from their team
- Same edit/cancel rights as PPC — before the campaign is sent to IT

---

### 🟪 Process Manager (PM)

The **gatekeeper and scheduler**.

- Reviews all incoming campaign requests
- **Approves** (with a schedule time) or **rejects** them
- Manages all users — can create Managers, IT users, and other PMs
- Sets up **daily recurring tasks** for IT
- Has the highest visibility — sees everything

---

### 🟩 IT

The **executor** at the end of the pipeline.

- Receives campaigns exactly at the scheduled time
- Acknowledges each task as **Done** or **Not Done** with a message
- Also handles daily recurring tasks assigned by the PM

---

# Backend — System Overview

This backend powers a **multi-role campaign management system** built to keep complex team workflows smooth, synchronized, and reliable.

---

### Core Stack

| Technology | Role |
| --- | --- |
| **Express.js** | Fast, minimal HTTP server with clean, structured routing |
| **MongoDB + Mongoose** | Flexible database with strict data modeling |
| **Socket.IO** | Real-time, event-driven communication between roles |
| **JWT** | Secure authentication via access & refresh tokens |
| **bcryptjs** | Industry-standard password encryption |

---

### What This System Does

This isn't just a CRUD API — it's a **workflow engine**.

- **Structured Campaign Pipeline**
    
    Campaigns move through clearly defined stages — PPC → Manager → Process Manager → IT — with each role having full ownership and visibility over their part of the process.
    
- **Role-Based Access Control (RBAC)**
    
    Every user sees exactly what they need and nothing more. Access is enforced at the route level, not just the UI.
    
- **Precision Scheduling**
    
    Campaigns are delivered to IT at exactly the right time using in-memory timers — no polling, no drift, no guesswork.
    
- **Timezone-Safe Task Scheduling**
    
    Daily IT tasks fire reliably in IST, even though the server runs in UTC on Railway. Time consistency is handled deliberately across every scheduling operation.
    
- **Zero-Lag Real-Time Updates**
    
    Socket.IO rooms ensure each role receives only relevant events — instantly, without stale data or unnecessary network overhead.
    

---

# System Architecture — Clean, Layered, and Intentional

This project is not just organized — it’s **deliberately structured to enforce separation of concerns**, predictable flow, and maintainability.

---

## 1. `models/` — Data Contracts

Defines the schema layer using **MongoDB + Mongoose**.

- Each file represents a collection:
    - `User`
    - `Campaign`
    - `Team`
    - `DailyTask`
- Acts as the **single source of truth for data shape and constraints**
- These are *strict blueprints*. Nothing enters or leaves the database without passing through them.

---

## 2. `controllers/` — Request Orchestrators

Handles incoming HTTP requests via **Express.js**.

- Responsibilities:
    - Receive request
    - Validate basic input
    - Call appropriate service
    - Send response
- **Strict rule:** No business logic
- Controllers are **traffic directors** — they route, not decide.

---

## 3. `services/` — Business Logic Core

This is where the system actually *thinks*.

- Encapsulates all domain logic:
    - Campaign approvals
    - Role transitions
    - IT acknowledgements
    - Scheduling triggers
- Controllers depend on services — never the reverse
- Services are the **brain of the system**.

---

## 4. `routes/` — Access Layer

Defines API endpoints and access control.

- Maps URLs → Controllers
- Integrates middleware for security

**Example:**

```
POST /campaign/create → only PPC, Manager
```

- Routes are the **gatekeepers**.

---

## 5. `middlewares/` — Security + Pre-processing

Executed before route handlers.

- `authMiddleware`
    - Verifies **JSON Web Token**
- `rbacMiddleware`
    - Enforces role-level permissions

---

## 6. `socket/` — Real-Time Layer

Powered by **Socket.IO**.

- `socket.js`
    - Manages connections and room-based emissions
- `campaignScheduler.js`
    - Handles time-based campaign release
- `dailyTaskScheduler.js`
    - Manages recurring IT tasks

**Key characteristic:**

- Event-driven
- Role-isolated updates
- Zero polling

This is the **nervous system** — signals move instantly.

---

## 7. `db/` — Initialization Layer

- Single responsibility: establish database connection at server startup

---

## 8. `utils/` — Shared Utilities

- `errorHandler.js`
    - Standardized error class
    - Async wrapper to eliminate repetitive try-catch

Reusable **low-level primitives** used everywhere.
