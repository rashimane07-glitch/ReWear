# ♻️ ReWear
### Sustainable Fashion. Smarter Choices. Circular Communities.

**Give clothes a second life — one exchange, sale, or donation at a time.**

ReWear is a student-focused sustainable fashion platform designed to encourage the reuse of pre-owned clothing. It connects students who want to sell, exchange, or donate clothes with others who are looking for affordable fashion.

Instead of allowing wearable clothes to go unused or become waste, ReWear creates a digital space where clothing can find a new owner.

**List → Discover → Connect → Reuse**

---

## 📌 Overview

Fast fashion and excessive clothing consumption contribute to growing textile waste. At the same time, students frequently have clothes they no longer use but which are still in good condition.

ReWear addresses this problem by bringing the second-hand clothing experience into one accessible platform.

The platform enables users to:

- 👕 List pre-owned clothing for sale.
- 🔄 Exchange clothes with other students.
- 💚 Donate wearable clothes.
- 🔍 Discover clothing listed by other users.
- 📸 Upload and view clothing images.
- 👤 Manage their accounts and listings.
- ♻️ Participate in a more sustainable fashion ecosystem.

ReWear aims to make sustainable fashion affordable, accessible, and convenient for students.

---

## 🎯 Problem Statement

Students often accumulate clothes that they no longer wear because of changing preferences, sizes, trends, or lifestyles.

However, existing options for selling, exchanging, or donating these clothes can be inconvenient or fragmented.

This leads to:

- Unused clothing accumulating in wardrobes.
- Wearable clothes being discarded unnecessarily.
- Increased demand for newly manufactured clothing.
- Limited access to affordable pre-owned fashion.
- Difficulty connecting people who want to give away clothes with those who need them.

**ReWear provides a centralized digital platform that makes clothing reuse easier.**

---

## 💡 Our Solution

ReWear introduces a student-oriented circular fashion marketplace where users can give their pre-owned clothes a second life.

Instead of treating clothing as a disposable product, the platform encourages users to extend its lifecycle through resale, exchange, and donation.

The platform combines:

- User authentication and account management.
- Clothing listing and discovery.
- Image upload and cloud-based image storage.
- Sustainable buying, selling, exchanging, and donating.
- Persistent application data storage.
- A simple and accessible user interface.

---

## 🏗️ System Architecture

ReWear follows a client-server architecture consisting of three primary layers.

| Layer | Responsibility | Technology |
|---|---|---|
| Frontend | User interface and interaction | React, Vite, JavaScript |
| Backend | APIs, business logic and authentication | Node.js, Express |
| Database | User and listing data persistence | IBM Cloudant |
| Image Storage | Cloud storage for clothing images | ImageKit |

### Architecture Overview

```text
             👤 USER
                |
                ▼
       ┌─────────────────┐
       │    FRONTEND     │
       │  React + Vite   │
       └────────┬────────┘
                |
                │ HTTP Requests
                ▼
       ┌─────────────────┐
       │     BACKEND     │
       │ Node.js +       │
       │ Express         │
       └────────┬────────┘
                |
          ┌─────┴──────┐
          |            |
          ▼            ▼
   ┌────────────┐ ┌────────────┐
   │  IBM       │ │  ImageKit  │
   │  Cloudant  │ │            │
   └────────────┘ └────────────┘
          |            |
          ▼            ▼
     User and       Clothing
     Listing Data   Images
```

### How the components work together

1. Users interact with the React frontend.
2. The frontend communicates with the Express backend through API requests.
3. The backend handles authentication, validation, and application logic.
4. IBM Cloudant stores application data, including user and listing information.
5. ImageKit stores newly uploaded clothing images.
6. Image references and relevant metadata are maintained with listing data.
7. The frontend retrieves image URLs and displays the images to users.

---

## 📱 Core Features

### 👕 1. Clothing Listings

Users can create clothing listings to make their pre-owned clothes available to others.

Listing functionality includes:

- Adding clothing details.
- Uploading clothing photographs.
- Providing relevant listing information.
- Making clothing available for reuse.

### 🔍 2. Clothing Discovery

Users can explore available clothing listings and discover items that match their interests.

The platform helps connect people who have unused clothes with people who can reuse them.

### 💰 3. Reselling

Users can list wearable clothes for resale, providing other students with access to more affordable fashion options.

### 🔄 4. Clothing Exchange

ReWear encourages users to exchange clothing rather than purchasing new items unnecessarily.

### 💚 5. Clothing Donation

Users can make wearable clothes available for donation, helping extend their useful life.

### 📸 6. Cloud-Based Image Storage

ReWear uses ImageKit to store newly uploaded clothing images.

Features include:

- Cloud-based image uploads.
- Image URL generation.
- Image references associated with listings.
- Image deletion support.
- Continued support for existing locally stored demonstration images.

### 👤 7. User Management

The backend supports user authentication and account-related operations.

Authentication and security components include:

- JWT-based authentication.
- Password hashing.
- Protected backend operations.
- Environment-based configuration for sensitive credentials.

---

## ☁️ Cloud Infrastructure

ReWear integrates two cloud services for application data and image management.

### IBM Cloudant — Database Layer

IBM Cloudant is used as the application's persistent database.

It stores application information such as:

- User records.
- Clothing listing information.
- Listing metadata.
- Image references and URLs.
- Other application-related records.

Cloudant allows the backend to access and manage application data through its database interface.

### ImageKit — Image Storage

ImageKit handles cloud-based storage of newly uploaded clothing images.

The image upload workflow:

```text
User selects clothing image
          |
          ▼
React Frontend
          |
          ▼
Node.js Backend
          |
          ▼
ImageKit Upload API
          |
          ▼
Image stored in ImageKit
          |
          ▼
Image URL returned
          |
          ▼
Image reference saved
in IBM Cloudant
          |
          ▼
Image displayed in ReWear
```

**Important:** IBM Cloudant stores application data and image references, while ImageKit stores the actual newly uploaded image files.

Existing demonstration images stored locally remain supported.

---

## 🧰 Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Backend | Node.js, Express.js |
| Database | IBM Cloudant |
| Image Storage | ImageKit |
| Authentication | JWT |
| Password Security | bcrypt |
| API Communication | REST APIs, HTTP |
| Package Management | npm |
| Development Environment | VS Code |
| Version Control | Git, GitHub |

---

## 📁 Project Structure

```text
ReWear/
│
├── FRONTEND/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── assets/
│   │   └── ...
│   ├── package.json
│   └── ...
│
├── BACKEND/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── utils/
│   │
│   ├── scripts/
│   ├── tests/
│   ├── uploads/
│   ├── .env.example
│   ├── package.json
│   └── README.md
│
├── .gitignore
├── README.md
└── ...
```

*The structure above is a high-level representation; individual files and folders may vary.*

---

## 🚀 Getting Started

Follow these steps to run ReWear locally.

### Prerequisites

Install the following:

- Node.js
- npm
- Git
- IBM Cloudant account and database
- ImageKit account and API credentials

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
```

Navigate into the project:

```bash
cd ReWear
```

### 2. Start the Backend

```bash
cd BACKEND
```

Install dependencies:

```bash
npm install
```

Create a `.env` file using `.env.example` as a reference.

Configure your required environment variables, including:

- Backend port and URL.
- IBM Cloudant connection settings.
- JWT configuration.
- ImageKit public key.
- ImageKit private key.
- ImageKit URL endpoint.

Start the development server:

```bash
npm run dev
```

The backend runs locally at:

```text
http://localhost:5000
```

### 3. Start the Frontend

Open another terminal.

Navigate to the frontend directory:

```bash
cd FRONTEND
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL displayed by Vite, typically:

```text
http://localhost:5173
```

### 4. Verify the Application

After starting both services:

1. Open the frontend in your browser.
2. Register or log in.
3. Create a clothing listing.
4. Upload a clothing image.
5. Verify that the listing is displayed.
6. Refresh the page and verify that the listing and image remain accessible.

---

## 🛡️ Security & Reliability

ReWear incorporates several security and reliability practices.

### Authentication

- JWT-based authentication.
- Password hashing.
- Protected application operations.

### Data Management

- Persistent application data through IBM Cloudant.
- Image references associated with listings.
- Separation of application data and image storage.

### Image Handling

- Cloud-based image uploads.
- Image validation and error handling.
- Image deletion support.
- Compatibility with older locally stored images.

### Environment Security

- Sensitive configuration stored in environment variables.
- API credentials excluded from source-controlled configuration.
- `.env` files excluded through Git ignore rules.

---

## 🧪 Testing & Validation

The backend includes automated tests for application functionality and storage-related operations.

The development and integration checks include:

| Test Area | Purpose |
|---|---|
| Backend startup | Verify successful server initialization |
| Database connection | Verify IBM Cloudant connectivity |
| ImageKit integration | Verify cloud image storage configuration |
| Image upload | Verify new clothing image uploads |
| Listing creation | Verify listing data persistence |
| Image retrieval | Verify uploaded images remain accessible |
| Legacy image support | Verify existing demonstration images |
| Storage tests | Verify image storage operations |

The ImageKit integration was also tested through an actual clothing listing upload, with the uploaded image verified in ImageKit Media Library and displayed again after refreshing the website.

---

## 🌱 Sustainability Impact

ReWear aims to support more responsible clothing consumption.

The platform encourages:

- ♻️ Extending the lifecycle of wearable clothes.
- 🌍 Reducing unnecessary clothing disposal.
- 💚 Encouraging reuse over unnecessary purchases.
- 🤝 Building a community around sustainable fashion.
- 💰 Making pre-owned fashion more accessible to students.

The long-term vision is to make clothing reuse a convenient and natural part of student life.

---

## 🔭 Future Scope

Potential improvements include:

- Advanced clothing search and filtering.
- Personalized clothing recommendations.
- In-app messaging between users.
- Improved exchange coordination.
- Pickup and delivery integration.
- Sustainability impact tracking.
- Clothing condition verification.
- AI-based clothing categorization.
- Enhanced user profiles and ratings.
- Mobile application support.
- Expansion to colleges and student communities.

---

## ⚠️ Current Project Scope

ReWear is a student-focused sustainable fashion platform developed as a college mini project.

The current implementation focuses on the core marketplace workflow, backend services, persistent data management, and cloud-based image storage.

Some future enhancements may require additional integrations and development.

---

## 👥 Project Team

Developed by:

- Rashi Mane
- Dhrati Nigam
- Bhumika Maheshwari
- Ananya Jain

Project: ReWear  
Category: Sustainable Technology / Circular Fashion  
Application: Student-focused Clothing Reuse Platform

---

 ⭐ Our Vision

We believe that one person's unused clothing can become another person's favourite outfit.

ReWear aims to transform unused wardrobes into opportunities for reuse, affordability, and sustainability.

Wear Again. Waste Less. Make an Impact.

---

## 📜 License

This project was developed for educational and academic purposes.

Licensing and attribution requirements for third-party libraries, assets, and services remain applicable.
