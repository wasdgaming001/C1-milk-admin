import { cleanPhone } from "../utils.js";

export function validateCustomerForm(form) {
  if (!form.name?.trim()) return "Name is required";
  if (!form.address?.trim()) return "Address is required";
  if (form.phone && !/^\d{10}$/.test(cleanPhone(form.phone)))
    return "Enter valid 10-digit phone";
  return null;
}
