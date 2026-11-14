# ReWear – Phase 1 (design system, navbar, footer, landing page)
1. `npm install`  2. `npm run dev`
- Photos: add files to `public/images/` (hero.jpg, p1–p4.jpg, cat-*.jpg, how-it-works.jpg). Missing ones show a blush placeholder.
- Data is MOCK (src/data/mockData.js) and is not saved to IBM Cloud. All data calls go through src/services/api.js.
- Pages for later phases show a "Coming soon" placeholder.

Phase 2 adds Explore + Product details. Extra photos needed: p5.jpg–p8.jpg. Requests are MOCK (not stored).

Phase 3 adds Sell + Donate (image upload). Optional photo: donate.jpg. New listings live in memory until refresh (mock).

Phase 4: login/signup, dashboard, wishlist. Demo login: demo@rewear.test / demo1234 (mock auth + mock data, resets on refresh).

Phase 5: Exchange page, offer-a-piece flow, request management. Sell page now supports 'Swap it'. All mock data resets on refresh.
