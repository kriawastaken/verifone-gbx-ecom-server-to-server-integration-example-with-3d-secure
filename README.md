# Verifone Greenbox (GBX) eCommerce Server-to-Server flow integration example with 3-D Secure

This project is an integration example of the Verifone Greenbox (GBX) eCommerce API, which in Iceland integrates with Landsbankinn's acquiring services amongst others, with near-full implementation of 3-D Secure on the checkout page.

## Coverage:

- [x] 3-D Secure with Songbird.js (Cardinal), including handling customer authentication required status (PARes status = C)
- [x] Card encryption (tokenization) with Verifone.js (OpenPGP.js wrapper)
- [x] Liability shift checking according to [Understanding the Impact of the different 3D Secure Responses](https://verifone.cloud/docs/online-payments/api-integration/server-server-payments-3d-secure-setup-guide/server-server#step-11b__003a-__0028client__002dside__0029-pares__005fstatus-__003d-__201cc__201d-continue-to-the-authentication-step__202f)
- [x] Payment initiation with the CAVV returned by 3-D Secure process
- [ ] Client-side error handling of server and Cardinal responses

## If you need integration assistance...

### ...and are integrating for the Greenbox-EMEA -> Iceland environment...

...then direct your inquiry to [verifone@verifone.is](mailto:verifone@verifone.is) and the helpdesk will forward your query to the CE team.

### For all other integrators...

...you should find the regional [Verifone website](https://verifone.com/global) most closely matching your own country and/or language and locate the most appropriate contact.

Copyright (c) 2025 Kría Elínarbur <kria.elinarbur@verifone.com>
