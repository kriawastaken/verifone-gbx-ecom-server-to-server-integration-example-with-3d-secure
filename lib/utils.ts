export const is_str = (q: any): q is string => {
    if (typeof q === "string") {
        return true;
    }

    return false;
};

export const is_nonzero_str = (q: any): q is string => {
    return is_str(q) && q.replace(/ /g, "").length > 0;
};

export const sleep = async (msec: number) => {
    return new Promise((resolve) => {
        setTimeout(() => resolve(msec), msec);
    });
};
