# UI Test Harness Adjudication

Before production code is changed because of an unstable UI or E2E test:

1. record current commit/build, browser/version/channel, active locale and relevant configuration;
2. reproduce the same interaction on a minimal native fixture or known-good baseline when practical;
3. inspect the target bounding box;
4. inspect `elementFromPoint` at the interaction coordinates;
5. inspect visibility, stacking and overlays;
6. capture the actual pointer, touch and input events;
7. decide whether the assertion/fixture is stale or assumes the wrong locale/state;
8. classify the result as CONFIGURATION_ERROR, TEST_FAILURE, HARNESS_DEFECT or PRODUCT_DEFECT;
9. do not change runtime behavior merely to pass an unstable harness;
10. do not weaken the user-visible behavior asserted by the test;
11. preserve adjudication evidence with the test result.

Production changes require independently reproduced product-defect evidence. Harness/fixture defects are fixed in fixtures, drivers, environment selection or assertions without weakening the product contract. A missing npm script/profile is configuration, not a failed product test.
