"use client";

import { useEffect, useState } from "react";

import { fetchCepAddress, formatCepAddressLine, getCepDigits } from "@/src/customer/cep-lookup.js";
import { sanitizeCep } from "@/src/customer/field-validation.js";

export function useCepLookup({ customer, initialCustomerHadAddress, setCustomer }) {
  const [cepLookup, setCepLookup] = useState({ message: "", status: "idle" });
  const [cepWasEdited, setCepWasEdited] = useState(false);
  const [autoFilledAddressLine, setAutoFilledAddressLine] = useState("");

  useEffect(() => {
    const cepDigits = getCepDigits(customer.cep);

    if (cepDigits.length !== 8) {
      setCepLookup({ message: "", status: "idle" });
      return undefined;
    }

    if (!cepWasEdited && initialCustomerHadAddress.current) return undefined;

    const controller = new AbortController();
    setCepLookup({ message: "Buscando endereço pelo CEP...", status: "loading" });

    fetchCepAddress(customer.cep, { signal: controller.signal })
      .then((address) => {
        if (!address) {
          setAutoFilledAddressLine("");
          setCepLookup({
            message: "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
            status: "error"
          });
          return;
        }

        const addressLine = formatCepAddressLine(address);
        setCustomer((currentCustomer) =>
          getCepDigits(currentCustomer.cep) === cepDigits
            ? { ...currentCustomer, address: addressLine || currentCustomer.address }
            : currentCustomer
        );
        setAutoFilledAddressLine(addressLine);
        setCepLookup({
          message: "Endereço preenchido pelo CEP. Complete com número e complemento.",
          status: "success"
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;

        setAutoFilledAddressLine("");
        setCepLookup({
          message: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
          status: "error"
        });
      });

    return () => controller.abort();
  }, [cepWasEdited, customer.cep, initialCustomerHadAddress, setCustomer]);

  function updateCep(value) {
    const cep = sanitizeCep(value);

    setCepWasEdited(true);
    setCustomer((currentCustomer) => {
      const shouldClearAddress =
        autoFilledAddressLine && currentCustomer.address.trim() === autoFilledAddressLine.trim();

      return {
        ...currentCustomer,
        address: shouldClearAddress ? "" : currentCustomer.address,
        cep
      };
    });
    setAutoFilledAddressLine("");
  }

  return { autoFilledAddressLine, cepLookup, updateCep };
}
