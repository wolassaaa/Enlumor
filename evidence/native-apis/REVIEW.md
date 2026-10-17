Task5+6 single readonly independent review: native_api_batch_review. Important1, no other confirmedCritical/Important.
DashScope official SSE finish_reason string "null" was incorrectly treated as truncated. Official example https://help.aliyun.com/en/model-studio/stream lines446-476.
REVIEW_RED npx vitest run tests/dashscope.test.ts:2failed7passed exit1 (incremental/cumulative). Fix accepts null/stringnull asongoing, still requiresstop and rejects length/truncated.
MODIFIED focused22passed, all110passed, actualElectron2passed5.6s includes stringnull SSE fixture; rollbacknative0/Cruise1/schema4/liveunchanged exit0. No second reviewer needed.
