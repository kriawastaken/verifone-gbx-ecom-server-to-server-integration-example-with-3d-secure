import {
    verifone_3ds_lookup_response_schema,
    verifone_payment_response_schema,
} from "@/schemas/verifone";
import { VERIFONE_CONFIG } from "@/verifone.config";
import z from "zod";

export type Verifone_Config = {
    verifone_js_url: string;
    songbird_js_url: string;
    api_uri: string;
    user_id: string;
    api_key: string;
    org_id: string;
    ppc_id: string;
    contract_currency: string;
    threeds_contract_id: string;
    key_alias: string;
    token_scope_id: string;
    public_key: string;
    basic_token: string;
};

const Create_ThreeDS_JWT_Errors = {
    REQUEST_ERROR: "REQUEST_ERROR",
    RESPONSE_ERROR: "RESPONSE_ERROR",
    BODY_PARSE_ERROR: "BODY_PARSE_ERROR",
} as const;

const create_threeds_jwt = async (): Promise<
    [null, string] | [keyof typeof Create_ThreeDS_JWT_Errors]
> => {
    let threeds_jwt;
    try {
        const threeds_jwt_res = await fetch(
            VERIFONE_CONFIG.api_uri + `/oidc/3ds-service/v2/jwt/create`,
            {
                method: "POST",
                headers: {
                    authorization: `Basic ${VERIFONE_CONFIG.basic_token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    threeds_contract_id: VERIFONE_CONFIG.threeds_contract_id,
                }),
            },
        );

        if (!threeds_jwt_res.ok) {
            console.log(
                "(warn) threeds_jwt_res.ok is false, status",
                threeds_jwt_res.statusText,
            );

            return [Create_ThreeDS_JWT_Errors.RESPONSE_ERROR];
        }

        threeds_jwt = (await threeds_jwt_res.json()).jwt;
    } catch (e) {
        console.log(
            "(warn) caught error when requesting/parsing jwt from verifone api",
            e,
        );

        return [Create_ThreeDS_JWT_Errors.REQUEST_ERROR];
    }

    return [null, threeds_jwt];
};

const Lookup_ThreeDS_Errors = {
    REQUEST_ERROR: "REQUEST_ERROR",
    JSON_STRINGIFY_ERROR: "JSON_STRINGIFY_ERROR",
    BODY_PARSE_ERROR: "BODY_PARSE_ERROR",
} as const;

const lookup_threeds = async ({
    amount,
    billing_first_name,
    billing_last_name,
    billing_address_1,
    billing_city,
    billing_country_code,
    email,
    encrypted_card,
    device_info_id,
    merchant_reference,
}: {
    amount: number;
    billing_first_name: string;
    billing_last_name: string;
    billing_address_1: string;
    billing_city: string;
    billing_country_code: string;
    email: string;
    encrypted_card: string;
    device_info_id: string;
    merchant_reference: string;
}): Promise<
    | [null, z.infer<typeof verifone_3ds_lookup_response_schema>]
    | [keyof typeof Lookup_ThreeDS_Errors]
> => {
    // prettier-ignore
    const threeds_lookup_url = VERIFONE_CONFIG.api_uri + "/oidc/3ds-service/v2/lookup";

    let threeds_res: Awaited<ReturnType<typeof fetch>>;
    try {
        threeds_res = await fetch(threeds_lookup_url, {
            method: "POST",
            headers: {
                authorization: `Basic ${VERIFONE_CONFIG.basic_token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                amount,
                billing_first_name,
                billing_last_name,
                billing_address_1,
                billing_city,
                billing_country_code,
                email,
                encrypted_card,
                public_key_alias: VERIFONE_CONFIG.key_alias,
                currency_code: VERIFONE_CONFIG.contract_currency,
                device_info_id,
                merchant_reference,
                threeds_contract_id: VERIFONE_CONFIG.threeds_contract_id,
            }),
        });
    } catch (e) {
        console.warn(
            `(verifone) Request to '${threeds_lookup_url}' failed:`,
            e,
        );

        return [Lookup_ThreeDS_Errors.REQUEST_ERROR];
    }

    let threeds_json: unknown;
    try {
        threeds_json = await threeds_res.json();
    } catch (e) {
        console.warn(
            `(verifone) Lexing response body from '${threeds_lookup_url}' failed:`,
            e,
        );

        return [Lookup_ThreeDS_Errors.JSON_STRINGIFY_ERROR];
    }

    // prettier-ignore
    const { data: threeds_data, error: threeds_err } = await verifone_3ds_lookup_response_schema.safeParseAsync(threeds_json);
    if (!threeds_data) {
        console.warn(
            `(verifone) Parsing response body from '${threeds_lookup_url}' failed:`,
            z.prettifyError(threeds_err),
        );

        return [Lookup_ThreeDS_Errors.BODY_PARSE_ERROR];
    }

    return [null, threeds_data];
};

const Calculate_Liability_Statuses = {
    ISSUER_NOT_ENROLLED: "ISSUER_NOT_ENROLLED",
    SIGNATURE_INVALID: "SIGNATURE_INVALID",
    CARDHOLDER_VERIFICATION: "CARDHOLDER_VERIFICATION",
    LIABILITY_SHIFTED: "LIABILITY_SHIFTED",
    UNKNOWN: "UNKNOWN",
} as const;

// see section about liability shift https://verifone.cloud/docs/online-payments/api-integration/server-server-payments-3d-secure-setup-guide/server-server#step-11b__003a-__0028client__002dside__0029-pares__005fstatus-__003d-__201cc__201d-continue-to-the-authentication-step__202f
const calculate_liability = (
    threeds_data: z.infer<typeof verifone_3ds_lookup_response_schema>,
): keyof typeof Calculate_Liability_Statuses => {
    if (
        !threeds_data.enrolled ||
        ["N", "U", "B"].includes(threeds_data.enrolled.toUpperCase())
    ) {
        return Calculate_Liability_Statuses.ISSUER_NOT_ENROLLED;
    }

    if (
        !threeds_data.signature_verification ||
        threeds_data.signature_verification === "N"
    ) {
        return Calculate_Liability_Statuses.SIGNATURE_INVALID;
    }

    const LIABILITY_PRECONDITION =
        threeds_data.signature_verification &&
        threeds_data.signature_verification.toUpperCase() === "Y" &&
        threeds_data.enrolled &&
        threeds_data.enrolled.toUpperCase() === "Y";

    if (
        LIABILITY_PRECONDITION &&
        threeds_data.pares_status &&
        threeds_data.pares_status.toUpperCase() === "C"
    ) {
        return Calculate_Liability_Statuses.CARDHOLDER_VERIFICATION;
    }

    if (
        LIABILITY_PRECONDITION &&
        threeds_data.pares_status &&
        ["Y", "A"].includes(threeds_data.pares_status.toUpperCase())
    ) {
        return Calculate_Liability_Statuses.LIABILITY_SHIFTED;
    }

    return Calculate_Liability_Statuses.UNKNOWN;
};

const Initiate_Payment_Errors = {
    REQUEST_ERROR: "REQUEST_ERROR",
    JSON_STRINGIFY_ERROR: "JSON_STRINGIFY_ERROR",
    BODY_PARSE_ERROR: "BODY_PARSE_ERROR",
} as const;

const initiate_payment = async ({
    amount,
    first_name,
    last_name,
    address_1,
    city,
    country,
    email_address,
    encrypted_card,
    merchant_reference,
    eci_flag,
    enrolled,
    cavv,
    pares_status,
    threeds_version,
    ds_transaction_id,
    signature_verification,
    error_desc,
    error_no,
}: {
    amount: number;
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    country: string;
    email_address: string;
    encrypted_card: string;
    merchant_reference: string;
    eci_flag: string;
    enrolled: string;
    cavv: string;
    pares_status: string;
    threeds_version: string;
    ds_transaction_id: string;
    signature_verification: string;
    error_desc: string;
    error_no: string;
}): Promise<
    | [keyof typeof Initiate_Payment_Errors]
    | [null, z.infer<typeof verifone_payment_response_schema>]
> => {
    // prettier-ignore
    const card_payment_url = VERIFONE_CONFIG.api_uri + "/oidc/api/v2/transactions/card";

    let payment_res: Awaited<ReturnType<typeof fetch>>;
    try {
        payment_res = await fetch(card_payment_url, {
            method: "POST",
            headers: {
                authorization: `Basic ${VERIFONE_CONFIG.basic_token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                payment_provider_contract: VERIFONE_CONFIG.ppc_id,
                amount,
                merchant_reference,
                threed_authentication: {
                    eci_flag,
                    enrolled,
                    cavv,
                    pares_status,
                    threeds_version,
                    ds_transaction_id,
                    signature_verification,
                    error_desc,
                    error_no,
                },
                customer_details: {
                    first_name,
                    last_name,
                    email_address,
                    billing: {
                        address_1,
                        city,
                        country,
                    },
                },
                currency_code: VERIFONE_CONFIG.contract_currency,
                encrypted_card,
                public_key_alias: VERIFONE_CONFIG.key_alias,
            }),
        });
    } catch (e) {
        console.warn(`(verifone) Request to '${card_payment_url}' failed:`, e);

        return [Initiate_Payment_Errors.REQUEST_ERROR];
    }

    let payment_json: unknown;
    try {
        payment_json = await payment_res.json();
    } catch (e) {
        console.warn(
            `(verifone) Lexing response body from '${card_payment_url}' failed:`,
            e,
        );

        return [Initiate_Payment_Errors.JSON_STRINGIFY_ERROR];
    }

    // prettier-ignore
    const { data: payment_data, error: payment_err } = await verifone_payment_response_schema.safeParseAsync(payment_json);
    if (!payment_data) {
        console.warn(
            `(verifone) Parsing response body from '${card_payment_url}' failed:`,
            z.prettifyError(payment_err),
        );

        return [Initiate_Payment_Errors.BODY_PARSE_ERROR];
    }

    return [null, payment_data];
};

export const verifone = {
    lookup_threeds,
    Lookup_ThreeDS_Errors,
    create_threeds_jwt,
    Create_ThreeDS_JWT_Errors,
    calculate_liability,
    Calculate_Liability_Statuses,
    initiate_payment,
    Initiate_Payment_Errors,
};
