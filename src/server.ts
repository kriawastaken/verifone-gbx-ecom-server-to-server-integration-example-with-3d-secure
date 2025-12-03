import express, { Request, Response } from "express";
import { VERIFONE_CONFIG } from "@/verifone.config";
import { randomUUID } from "crypto";
import z from "zod";
import { verifone } from "@/lib/verifone";

const app = express();
const port = process.env.PORT || 8080;

app.set("view engine", "ejs");

app.disable("x-powered-by");

app.use(express.json());
app.use(express.urlencoded());
app.use("/public/static", express.static("static"));

app.get("/", (_req: Request, res: Response) => {
    return res.redirect(308, "/Payment/Card?DefaultCardholderCountry=IS");
});

app.get("/Payment/Card", async (req: Request, res: Response) => {
    const [threeds_jwt_err, threeds_jwt] = await verifone.create_threeds_jwt();
    if (!threeds_jwt) {
        switch (threeds_jwt_err) {
            case "REQUEST_ERROR": {
                return res.status(500).render("error", {
                    code: "No3DSecureJWT",
                    // prettier-ignore
                    message: "There was an error requesting a 3-D Secure JWT from the Verifone servers.",
                    pathname: req.path,
                });
            }

            case "BODY_PARSE_ERROR": {
                return res.status(500).render("error", {
                    code: "No3DSecureJWT",
                    // prettier-ignore
                    message: "There was an error parsing the response payload from the Verifone servers.",
                    pathname: req.path,
                });
            }

            case "RESPONSE_ERROR": {
                return res.status(500).render("error", {
                    code: "No3DSecureJWT",
                    // prettier-ignore
                    message: "There was an error parsing the response JSON from the Verifone servers.",
                    pathname: req.path,
                });
            }
        }
    }

    return res.render("card-payment", {
        error: null,
        country: req.query.DefaultCardholderCountry ?? "IS",
        checkout_id: randomUUID().replace(/\-/g, ""),
        vf_public_key: VERIFONE_CONFIG.public_key,
        vf_threeds_jwt: threeds_jwt,
        scripts: [
            VERIFONE_CONFIG.verifone_js_url,
            VERIFONE_CONFIG.songbird_js_url,
        ],
    });
});

const Card_3DS_Requst_Payload_Schema = z.object({
    cardholder_name: z.string().min(1),
    cardholder_email: z.email(),
    cardholder_address_1: z.string(),
    cardholder_locality: z.string().min(1),
    cardholder_country: z.string().length(2),
    device_info_id: z.string().min(1),
    encrypted_card: z.string().min(1),
    merchant_reference: z.string().min(1),
});

app.post("/Payment/3DSecureLookup", async (req: Request, res: Response) => {
    // prettier-ignore
    const { data: body, error: body_err } = await Card_3DS_Requst_Payload_Schema.safeParseAsync(req.body);
    if (!body) {
        return res.status(400).json({
            error: {
                code: "InvalidSubmissionData",
                message: z.prettifyError(body_err),
                pathname: req.path,
            },
        });
    }

    const [first_name, last_name] = body.cardholder_name.split(" ");
    const [threeds_err, threeds_data] = await verifone.lookup_threeds({
        amount: 10,
        billing_first_name: first_name ?? "Undefined",
        billing_last_name: last_name ?? "Undefined",
        billing_address_1: body.cardholder_address_1,
        billing_city: body.cardholder_locality,
        billing_country_code: body.cardholder_country,
        email: body.cardholder_email,
        encrypted_card: body.encrypted_card,
        device_info_id: body.device_info_id,
        merchant_reference: body.merchant_reference,
    });
    if (!threeds_data) {
        switch (threeds_err) {
            case "REQUEST_ERROR": {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: "Error while performing Verifone 3-D Secure lookup",
                        pathname: req.path,
                    },
                });
            }

            case "JSON_STRINGIFY_ERROR": {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: "Error while parsing Verifone 3-D Secure lookup response",
                        pathname: req.path,
                    },
                });
            }

            case "BODY_PARSE_ERROR": {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: "Error while parsing Verifone 3-D Secure lookup response",
                        pathname: req.path,
                    },
                });
            }

            default: {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: threeds_err,
                        pathname: req.path,
                    },
                });
            }
        }
    }

    switch (verifone.calculate_liability(threeds_data)) {
        case verifone.Calculate_Liability_Statuses.ISSUER_NOT_ENROLLED: {
            return res.status(500).json({
                error: {
                    code: "ThreeDSecureEnrollmentError",
                    message:
                        "Card issuer is not enrolled in 3-D Secure scheme.",
                    pathname: req.path,
                },
            });
        }

        case verifone.Calculate_Liability_Statuses.SIGNATURE_INVALID: {
            return res.status(500).json({
                error: {
                    code: "ThreeDSecureResponseSignatureNotVerifiedError",
                    message:
                        "3-D Secure response signature cannot be verified.",
                    pathname: req.path,
                },
            });
        }

        case verifone.Calculate_Liability_Statuses.CARDHOLDER_VERIFICATION: {
            return res.status(200).json({
                success: {
                    code: "CardholderVerification",
                    // prettier-ignore
                    message: "Please proceed with Cardholder verification on client with Cardinal.continue(...)",
                    pathname: req.path,
                },
                data: {
                    enrolled: threeds_data.enrolled,
                    ds_transaction_id: threeds_data.ds_transaction_id,
                    acs_url: threeds_data.acs_url,
                    payload: threeds_data.payload,
                    transaction_id: threeds_data.transaction_id,
                },
            });
        }

        case verifone.Calculate_Liability_Statuses.LIABILITY_SHIFTED: {
            return res.status(200).json({
                success: {
                    code: "LiabilityShifted",
                    // prettier-ignore
                    message: "Please proceed with payment at /Payment/SecuredCard",
                    pathname: req.path,
                },
                data: {
                    eci_flag: threeds_data.eci_flag,
                    enrolled: threeds_data.enrolled,
                    cavv: threeds_data.cavv,
                    pares_status: threeds_data.pares_status,
                    threeds_version: threeds_data.threeds_version,
                    ds_transaction_id: threeds_data.ds_transaction_id,
                    signature_verification: threeds_data.signature_verification,
                    error_desc: threeds_data.error_desc,
                    error_no: threeds_data.error_no,
                },
            });
        }

        default: {
            return res.status(500).json({
                error: {
                    code: "ThreeDSecureLiabilityError",
                    // prettier-ignore
                    message: "Your payment attempt was rejected due to liability shifting onto the merchant. We don't know exactly why.",
                    pathname: req.path,
                },
            });
        }
    }
});

const Card_Payment_Requst_Payload_Schema = z.object({
    cardholder_name: z.string().min(1),
    cardholder_email: z.email(),
    cardholder_address_1: z.string(),
    cardholder_locality: z.string().min(1),
    cardholder_country: z.string().length(2),
    encrypted_card: z.string().min(1),
    merchant_reference: z.string().min(1),
    eci_flag: z.string().min(1),
    enrolled: z.string().min(1),
    cavv: z.string().min(1),
    pares_status: z.string().min(1),
    threeds_version: z.string().min(1),
    ds_transaction_id: z.string().min(1),
    signature_verification: z.string().min(1),
    error_desc: z.string(),
    error_no: z.string(),
});

app.post("/Payment/SecuredCard", async (req, res) => {
    // prettier-ignore
    const { data: body, error: body_err } = await Card_Payment_Requst_Payload_Schema.safeParseAsync(req.body);
    if (!body) {
        return res.status(400).json({
            error: {
                code: "InvalidSubmissionData",
                message: z.prettifyError(body_err),
                pathname: req.path,
            },
        });
    }

    const [first_name, last_name] = body.cardholder_name.split(" ");
    const [payment_err, payment_data] = await verifone.initiate_payment({
        amount: 10,
        first_name: first_name ?? "Undefined",
        last_name: last_name ?? "Undefined",
        address_1: body.cardholder_address_1,
        city: body.cardholder_locality,
        country: body.cardholder_country,
        email_address: body.cardholder_email,
        encrypted_card: body.encrypted_card,
        merchant_reference: body.merchant_reference,
        eci_flag: body.eci_flag,
        enrolled: body.enrolled,
        cavv: body.cavv,
        pares_status: body.pares_status,
        threeds_version: body.threeds_version,
        ds_transaction_id: body.ds_transaction_id,
        signature_verification: body.signature_verification,
        error_desc: body.error_desc,
        error_no: body.error_no,
    });
    if (!payment_data) {
        switch (payment_err) {
            case verifone.Initiate_Payment_Errors.REQUEST_ERROR: {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: "Error while performing Verifone payment",
                        pathname: req.path,
                    },
                });
            }

            case verifone.Initiate_Payment_Errors.JSON_STRINGIFY_ERROR: {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: "Error while parsing Verifone payment response payload",
                        pathname: req.path,
                    },
                });
            }

            case verifone.Initiate_Payment_Errors.BODY_PARSE_ERROR: {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: "Error while parsing Verifone payment response JSON",
                        pathname: req.path,
                    },
                });
            }

            default: {
                return res.status(500).json({
                    error: {
                        code: "InternalServerError",
                        // prettier-ignore
                        message: payment_err,
                        pathname: req.path,
                    },
                });
            }
        }
    }

    switch (payment_data.status) {
        case "AUTHORIZED": {
            return res.status(200).json({
                success: {
                    code: "PaymentStatusAuthorized",
                    message: "Payment is authorized",
                    pathname: req.path,
                },
            });
        }

        case "PENDING": {
            return res.status(200).json({
                success: {
                    code: "PaymentStatusPending",
                    message: "Payment is pending",
                    pathname: req.path,
                },
            });
        }

        case "DECLINED": {
            return res.status(200).json({
                error: {
                    code: "PaymentStatusDeclined",
                    message: "Payment was declined",
                    pathname: req.path,
                },
            });
        }

        case "UNKNOWN": {
            return res.status(200).json({
                error: {
                    code: "PaymentStatusUnknown",
                    message: "Payment is pending",
                    pathname: req.path,
                },
            });
        }

        default: {
            return res.status(400).json({
                error: {
                    code: "PaymentStatusUnsuccessful",
                    // prettier-ignore
                    message: "An error or otherwise unsuccessful response code was returned by the processor.",
                    pathname: req.path,
                },
            });
        }
    }
});

app.use((req: Request, res: Response) => {
    return res.render(
        "error",
        {
            code: "NoCorrespondingController",
            message: "No controller matched the route you requested.",
            pathname: req.path,
        },
        (err, html) => {
            if (err) {
                return res.status(500);
            }

            return res
                .status(404)
                .setHeader("Content-Type", "application/xml")
                .send(html);
        },
    );
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
