"use client";

import { useEffect, useRef, useState } from "react";

import { fetchCepAddress, getCepDigits } from "@/src/customer/cep-lookup.js";
import {
  cepPattern,
  sanitizeCep,
  statePattern
} from "@/src/customer/field-validation.js";
import { SanitizedInput } from "@/src/components/form/sanitized-input.js";

const emptyAddressValues = {
  cep: "",
  city: "",
  complement: "",
  district: "",
  number: "",
  referencePoint: "",
  state: "",
  street: ""
};

function getInitialValues(defaults) {
  return {
    ...emptyAddressValues,
    ...defaults,
    referencePoint: defaults?.referencePoint ?? defaults?.reference_point ?? ""
  };
}

function hasCompleteAddressLocation(values) {
  return Boolean(values.street && values.district && values.city && values.state);
}

export function CepAddressFields({ defaults = {}, referencePointClassName = "" }) {
  const [values, setValues] = useState(() => getInitialValues(defaults));
  const [cepWasEdited, setCepWasEdited] = useState(false);
  const [lookup, setLookup] = useState({ message: "", status: "idle" });
  const initialHadCompleteAddress = useRef(hasCompleteAddressLocation(getInitialValues(defaults)));

  useEffect(() => {
    const cepDigits = getCepDigits(values.cep);

    if (cepDigits.length !== 8) {
      setLookup({ message: "", status: "idle" });
      return;
    }

    if (!cepWasEdited && initialHadCompleteAddress.current) {
      return;
    }

    const controller = new AbortController();

    setLookup({ message: "Buscando endereço pelo CEP...", status: "loading" });

    fetchCepAddress(values.cep, { signal: controller.signal })
      .then((address) => {
        if (!address) {
          setLookup({
            message: "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
            status: "error"
          });
          return;
        }

        setValues((currentValues) => {
          if (getCepDigits(currentValues.cep) !== cepDigits) {
            return currentValues;
          }

          return {
            ...currentValues,
            city: address.city,
            district: address.district,
            state: address.state,
            street: address.street
          };
        });
        setLookup({
          message: "Endereço preenchido pelo CEP. Confira número e complemento.",
          status: "success"
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }

        setLookup({
          message: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
          status: "error"
        });
      });

    return () => controller.abort();
  }, [cepWasEdited, values.cep]);

  function updateValue(field, value) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value
    }));
  }

  function updateCep(value) {
    setCepWasEdited(true);
    updateValue("cep", sanitizeCep(value));
  }

  return (
    <>
      <label>
        <span>CEP</span>
        <SanitizedInput
          autoComplete="postal-code"
          inputMode="numeric"
          name="cep"
          onChange={(event) => updateCep(event.currentTarget.value)}
          pattern={cepPattern}
          required
          sanitizer="cep"
          title="Use 8 números, com ou sem hífen."
          value={values.cep}
        />
      </label>

      {lookup.message ? (
        <p
          aria-live="polite"
          className="helper-text span-all"
          role={lookup.status === "error" ? "alert" : "status"}
        >
          {lookup.message}
        </p>
      ) : null}

      <label>
        <span>Rua</span>
        <input
          autoComplete="address-line1"
          name="street"
          onChange={(event) => updateValue("street", event.target.value)}
          required
          value={values.street}
        />
      </label>
      <label>
        <span>Número</span>
        <input
          name="number"
          onChange={(event) => updateValue("number", event.target.value)}
          required
          value={values.number}
        />
      </label>
      <label>
        <span>Bairro</span>
        <input
          name="district"
          onChange={(event) => updateValue("district", event.target.value)}
          required
          value={values.district}
        />
      </label>
      <label>
        <span>Cidade</span>
        <input
          autoComplete="address-level2"
          name="city"
          onChange={(event) => updateValue("city", event.target.value)}
          required
          value={values.city}
        />
      </label>
      <label>
        <span>UF</span>
        <SanitizedInput
          autoComplete="address-level1"
          maxLength={2}
          name="state"
          onChange={(event) => updateValue("state", event.currentTarget.value)}
          pattern={statePattern}
          required
          sanitizer="state"
          title="Use a sigla do estado com 2 letras."
          value={values.state}
        />
      </label>
      <label>
        <span>Complemento</span>
        <input
          autoComplete="address-line2"
          name="complement"
          onChange={(event) => updateValue("complement", event.target.value)}
          value={values.complement}
        />
      </label>
      <label className={referencePointClassName}>
        <span>Ponto de referência</span>
        <input
          name="referencePoint"
          onChange={(event) => updateValue("referencePoint", event.target.value)}
          value={values.referencePoint}
        />
      </label>
    </>
  );
}
