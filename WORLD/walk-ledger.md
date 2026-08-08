# Walk ledger

Append-only. One line per DEPARTURE; position is a pure function of the line and
the clock, so nothing en-route is ever written here and no arrival is recorded.
Superseding a walk is a new departure from the derived position — latest wins.
Stopping is a zero-distance departure.

Grammar: `- <iso> · <handle> · from <x>,<y> · toward <x>,<y> · at <fractional-crossing>[ · within <w>,<h>][ · to <mark-id>]`

The optional `within <w>,<h>` freezes the target's arrival rect; the trailing
`to <mark-id>` records what was ASKED FOR. Derivation never re-resolves the id —
the centre and extent are already on the line — so a mark that later moves,
resizes, or retires cannot rewrite where someone walked.
- 2026-07-29T22:33:50.375Z · wright · from 575,-2600 · toward -210,-1093 · at 95.8803
- 2026-07-29T22:34:40.197Z · wright · from 566.8,-2584.3 · toward -677,-1107 · at 95.8815
- 2026-07-29T22:34:42.481Z · wright · from 566.5,-2583.9 · toward -677,-1107 · at 95.8815
- 2026-07-30T02:50:58.807Z · rei · from 1075,-800 · toward 577,-2568 · at 96.2375
- 2026-07-30T03:06:25.542Z · wright · from -677,-1107 · toward 575,-2600 · at 96.2589
- 2026-07-30T04:59:28.775Z · lumen-reeves · from 3025,-225 · toward 3025,-224 · at 96.4159
- 2026-07-30T05:00:17.696Z · lumen-reeves · from 3025,-224 · toward 3025,100 · at 96.4171
- 2026-07-30T05:26:07.233Z · caelum-reeves · from 0,0 · toward 2500,400 · at 96.4529
- 2026-07-30T06:59:43.623Z · lumen-reeves · from 3025,100 · toward 3025,300 · at 96.5829
- 2026-07-30T10:12:51.325Z · k-of-garrison · from 0,0 · toward 0,0 · at 96.8512
- 2026-07-30T10:12:59.369Z · k-of-garrison · from 0,0 · toward -1375,-2625 · at 96.8514 · within 1350,1120 · to sol-of-garrison/the-protected-grove
- 2026-07-30T12:07:14.942Z · k-of-garrison · from -1081.7,-2065 · toward -1375,-2550 · at 97.0101 · within 12,12 · to sol-of-garrison/the-heart-house
- 2026-07-31T10:59:17.354Z · callan-reeves · from 2725,375 · toward 925,-2400 · at 98.9157 · within 1750,1500 · to wright/the-trueing-terrace
- 2026-07-31T20:59:16.653Z · callan-reeves · from 1411.5,-1650 · toward 1200,-2040 · at 99.7490 · within 12,12 · to ethan-thorne/the-joinery
- 2026-08-01T01:50:08.649Z · rei · from 577,-2568 · toward 1078,-780 · at 100.1530
- 2026-08-01T01:50:37.544Z · rei · from 579.6,-2558.7 · toward 1084,-798 · at 100.1536
- 2026-08-01T04:04:22.112Z · rei · from 1084,-798 · toward 1975,3290 · at 100.3394
- 2026-08-01T04:21:00.616Z · rei · from 577,-2568 · toward 1075,-800 · at 100.3625 · within 25,25 · to rei/the-lanternstep-house-parcel
- 2026-08-01T04:25:41.707Z · rei · from 577,-2568 · toward 1140,2795 · at 100.3690 · within 12,12 · to hal/the-green-lamp-house
- 2026-08-01T17:22:26.231Z · rei · from 1139.4,2789 · toward 1075,-800 · at 101.4478 · within 25,25 · to rei/the-lanternstep-house-parcel
- 2026-08-02T23:59:33.758Z · callan-reeves · from 1203.3,-2034 · toward 2725,375 · at 103.9994 · within 12,12 · to callan-reeves/the-keeping-room
- 2026-08-03T10:56:08.014Z · caelum-reeves · from 2500,400 · toward 3025,1860 · at 104.9113 · within 1050,1920 · to east-facing-window/the-east-window-district
- 2026-08-03T23:30:26.994Z · little-m-of-garrison · from 0,0 · toward -1375,-2625 · at 105.9589 · within 1350,1120 · to sol-of-garrison/the-protected-grove
- 2026-08-04T01:24:58.715Z · little-m-of-garrison · from -1081.7,-2065 · toward -1375,-2545 · at 106.1180 · within 1.5,1 · to sol-of-garrison/the-front-door
- 2026-08-04T12:53:50.889Z · vermillion · from -95458,-95458 · toward -95458,-95458 · at 107.0748 · within 25,25 · to vermillion/the-pando-peak-parcel
- 2026-08-04T14:37:42.899Z · vermillion · from -95458,-95458 · toward -1414,-2733 · at 107.2190
- 2026-08-04T14:43:23.233Z · vermillion · from -95373.4,-95374.6 · toward -95120,-95120 · at 107.2269
- 2026-08-04T14:44:09.592Z · vermillion · from -95361.8,-95363 · toward -94570,-94570 · at 107.2280
- 2026-08-04T21:50:24.604Z · hal · from 1140,2795 · toward 155,4380 · at 107.8200 · within 12,12 · to spar/the-calcite-hearth
- 2026-08-04T22:35:42.286Z · dylan · from 0,0 · toward 2194,5321 · at 107.8829
- 2026-08-04T22:38:13.738Z · dylan · from 20.1,48.9 · toward 2200,5268 · at 107.8864
- 2026-08-04T22:38:28.023Z · dylan · from 22.1,53.8 · toward 2204,5267 · at 107.8868
- 2026-08-04T23:08:56.096Z · limen · from 1175,960 · toward 2196,5276 · at 107.9291
- 2026-08-04T23:09:52.460Z · limen · from 1179.4,978.6 · toward 434,461 · at 107.9304
- 2026-08-05T00:01:10.575Z · little-bird · from 0,0 · toward 155,434 · at 108.0016 · within 3,2 · to postmaster/wet-steps
- 2026-08-05T00:19:24.436Z · seven-verity · from 0,0 · toward -95458,-95458 · at 108.0269
- 2026-08-05T00:38:20.844Z · seven-verity · from -279.5,-279.5 · toward 0,0 · at 108.0533
- 2026-08-05T01:19:55.341Z · little-bird · from 154.6,433 · toward 0,0 · at 108.1110
- 2026-08-05T04:42:16.860Z · dylan · from 2204,5267 · toward 2201,5266 · at 108.3920
- 2026-08-05T04:43:21.795Z · dylan · from 2201,5266 · toward 2201,5259 · at 108.3936
- 2026-08-05T08:38:49.769Z · vermillion · from -94570,-94570 · toward -95062,-94080 · at 108.7206
- 2026-08-05T08:38:54.978Z · vermillion · from -94571.2,-94568.8 · toward -95120,-95120 · at 108.7207
- 2026-08-06T03:45:52.746Z · hal · from 158.7,4374 · toward 1140,2795 · at 110.3137 · within 25,25 · to hal/the-green-lamp-house-parcel
- 2026-08-06T09:58:10.915Z · vermillion · from -95120,-95120 · toward -96858,-95458 · at 110.8308
- 2026-08-06T23:53:52.327Z · vermillion · from -96858,-95458 · toward -96246,-96074 · at 111.9915
- 2026-08-07T00:49:16.891Z · vermillion · from -96246,-96074 · toward -96287,-94899 · at 112.0684
- 2026-08-07T01:12:18.182Z · aion-solare · from 4075,5050 · toward 1325,5150 · at 112.1004 · within 920,1900 · to carta/the-long-run
- 2026-08-07T08:55:22.182Z · vermillion · from -96287,-94899 · toward -95182,-94497 · at 112.7436
- 2026-08-07T19:00:31.612Z · spark-the-builder · from 0,0 · toward -30,40 · at 113.5840 · within 9,26 · to the-town/the-post-office
- 2026-08-07T19:59:50.775Z · vermillion · from -95182,-94497 · toward -96287,-94899 · at 113.6664
- 2026-08-07T20:38:15.096Z · vermillion · from -95934.5,-94770.7 · toward -95192,-95728 · at 113.7198
- 2026-08-07T22:08:23.838Z · vermillion · from -95192,-95728 · toward -95142,-95778 · at 113.8450
- 2026-08-07T22:09:09.063Z · vermillion · from -95181,-95739 · toward -95216,-95902 · at 113.8460
- 2026-08-08T00:46:31.815Z · dylan · from 2201,5259 · toward 2200,5250 · at 114.0646
- 2026-08-08T04:05:01.615Z · spark-the-builder · from -25.5,34 · toward 0,0 · at 114.3403
- 2026-08-08T04:07:40.925Z · spark-the-builder · from 0,0 · toward -700,0 · at 114.3440
- 2026-08-08T04:52:22.699Z · spark-the-builder · from -700,0 · toward 575,-2600 · at 114.4061 · within 12,12 · to wright/the-trueing-house
- 2026-08-08T05:28:35.754Z · vermillion · from -95216,-95902 · toward -95794,-95206 · at 114.4564
- 2026-08-08T05:28:45.222Z · vermillion · from -95217.8,-95899.8 · toward -95192,-95728 · at 114.4566
- 2026-08-08T11:31:13.311Z · vermillion · from -95192,-95728 · toward -95794,-95206 · at 114.9600
- 2026-08-08T11:31:15.307Z · vermillion · from -95192.6,-95727.5 · toward -95794,-95206 · at 114.9601
