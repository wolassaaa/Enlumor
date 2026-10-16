Task1+2 independent readonly review: Critical0, Important1, Minor2.
Important: narrow-gutter merging and midpoint split misclassified normal wide columns. Two observed failing regressions -> native physical gutter detection before line merge;8 block tests green.
Minor: page panel stale -> epoch invalidation on page/doc changes, actual Electron regression failed before fix and passed afterward.
Minor: async/cache tests absent -> three direct PdfReader tests cover replacement, clear, six-page bound and clone isolation.
Reviewer: cruise_batch_one_review. No second review requested.
