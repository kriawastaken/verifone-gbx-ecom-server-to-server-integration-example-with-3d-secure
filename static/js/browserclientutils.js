const format_card_number = (number) => {
    const number_normalised = number.replaceAll(" ", "");

    return number_normalised.split("").reduce((seed, next, index) => {
        switch (next) {
            case "0":
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7":
            case "8":
            case "9": {
                break;
            }

            default: {
                return seed;
            }
        }

        if (index > 15) {
            return seed;
        }

        if (index !== 0 && !(index % 4)) {
            seed += " ";
        }

        return seed + next;
    }, "");
};

const format_card_expiry_date = (expiry) => {
    const expiry_normalised = expiry.replaceAll("/", "");

    return expiry_normalised.split("").reduce((seed, next, index) => {
        switch (next) {
            case "0":
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7":
            case "8":
            case "9": {
                break;
            }

            default: {
                return seed;
            }
        }

        if (index > 3) {
            return seed;
        }

        if (index === 2) {
            seed += "/";
        }

        return seed + next;
    }, "");
};

const full_strip = (v) => {
    return v.replace(/ /g, '');
}