# UI Test Harness Adjudication

Before production code is changed because of an unstable UI or E2E test:

1. reproduce the interaction on a minimal native fixture;
2. record browser, version, and channel;
3. inspect the target bounding box;
4. inspect `elementFromPoint` at the interaction coordinates;
5. inspect visibility, stacking, and overlays;
6. capture the actual pointer, touch, and input events;
7. classify the evidence as a product defect or a harness defect;
8. do not change runtime behavior merely to pass an unstable harness;
9. do not weaken the user-visible behavior asserted by the test;
10. preserve adjudication evidence with the test result.

Production changes require product-defect evidence. Harness defects are fixed
in fixtures, drivers, environment selection, or assertions without weakening
the product contract.
