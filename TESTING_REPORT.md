# ReWear Frontend: Testing Report (Person 4)

Branch: person4-frontend-features
Date: 16-11-2026
Mode: MOCK data (VITE_API_URL empty)

## Test results (manual)

| # | Test | Result |
|---|------|--------|
| 1 | Create a "sell" listing with 5 photos | Pass |
| 2 | Empty form shows field errors, does not submit | Pass |
| 3 | Send a purchase request on another user's listing | Pass |
| 4 | Duplicate request blocked ("Request pending" button disabled) | Pass |
| 5 | Dashboard: received requests, accept, contact shown | Pass |
| 6 | Mark request as completed | Pass |
| 7 | Sent tab, cancel pending request | Pass |
| 8 | My Listings: edit and delete | Pass |

## Not tested

- Live end-to-end test against the real backend. The backend started on
  port 5000 but Cloudant is not configured (CLOUDANT_URL and
  CLOUDANT_APIKEY missing), so signup, login and listing create cannot work.

## Backend gaps

1. `lookingFor` (exchange listings) has no backend field, so it is not saved.
2. `location` has no backend field, so it is not saved.
3. Category mismatch: the frontend has 6 categories (Western Wear, Ethnic
   Wear, Casual Wear, Formal Wear, Accessories, Men's Fashion). The backend
   has 8 (tops, bottoms, dresses, ethnic_wear, outerwear, activewear,
   accessories, other). Only 2 match exactly. A temporary mapping in
   `api.js` (CATEGORY_MAP) sends the rest to the closest value, so data is
   approximate. The categories need to be agreed with the backend developer.
4. The frontend size list has no XXL, although the backend accepts `xxl`.
5. The backend cannot set a listing's status, so "mark unavailable" is not possible.

## Changes made

- `api.js`: label-to-backend mapping (category, size, condition) applied in `createListing`
- Updated: Dashboard, Explore, ExchangeOfferModal, ProductCard, RequestRow,
  ListingForm, ImageUploader, StatusBadge

## Conclusion

Frontend features work in mock mode. A live test against the backend is
pending until database keys are available.