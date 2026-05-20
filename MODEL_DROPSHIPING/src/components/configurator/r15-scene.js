"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

const slotVisuals = {
  bolha: { position: [0, 0.95, 1.3], scale: [0.58, 0.18, 0.08], color: "#7ab7ff" },
  "frente-carenagem": { position: [0, 0.55, 1.18], scale: [0.75, 0.4, 0.18], color: "#ff9652" },
  "asa-lateral": { position: [0, 0.5, 0.48], scale: [1.05, 0.08, 0.24], color: "#ffc77d" },
  "entrada-de-ar": { position: [0, 0.63, 0.92], scale: [0.28, 0.16, 0.14], color: "#7bd0bd" },
  retrovisor: { position: [0, 1.05, 0.9], scale: [0.95, 0.05, 0.05], color: "#5d6d7f" },
  "manete-manopla-pesinho": { position: [0, 0.88, 0.55], scale: [1.2, 0.04, 0.04], color: "#d16f38" },
  "pisca-dianteiro": { position: [0, 0.58, 1.02], scale: [0.95, 0.05, 0.05], color: "#e5b03b" },
  farol: { position: [0, 0.75, 1.12], scale: [0.3, 0.16, 0.12], color: "#f9f3aa" },
  "lanterna-traseira": { position: [0, 0.8, -1.02], scale: [0.26, 0.12, 0.1], color: "#ff6d6d" },
  "rabeta-eliminador": { position: [0, 0.77, -0.88], scale: [0.48, 0.16, 0.14], color: "#ff9f68" },
  monoposto: { position: [0, 0.92, -0.25], scale: [0.4, 0.14, 0.2], color: "#d35e2f" },
  escapamento: { position: [-0.55, 0.25, -0.55], scale: [0.12, 0.12, 0.58], color: "#8d98a7" },
  "protetor-radiador": { position: [0, 0.42, 0.45], scale: [0.42, 0.28, 0.06], color: "#5b7d8a" },
  "protetor-tanque": { position: [0, 0.74, 0.15], scale: [0.36, 0.42, 0.05], color: "#2f313b" },
  "tampa-tanque": { position: [0, 0.92, 0.12], scale: [0.14, 0.04, 0.14], color: "#f0ebe1" },
  "tampa-oleo": { position: [0.35, 0.28, -0.05], scale: [0.1, 0.05, 0.1], color: "#d8b04f" },
  "tampao-pinhao": { position: [0.42, 0.18, 0.08], scale: [0.18, 0.05, 0.18], color: "#71858f" },
  "suporte-celular": { position: [0, 1.02, 0.48], scale: [0.18, 0.24, 0.06], color: "#3c444b" },
  "suporte-garupa": { position: [0, 0.98, -0.6], scale: [0.4, 0.08, 0.08], color: "#73808f" },
  slider: { position: [0, 0.28, 0.12], scale: [1.24, 0.08, 0.08], color: "#2b3137" },
  "adesivagem-completa": { position: [0, 0.58, 0.02], scale: [0.72, 0.34, 1.46], color: "#84c0ff" }
};

function BaseMotorcycle() {
  return (
    <group>
      <mesh position={[-0.95, 0, -0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.44, 0.09, 24, 48]} />
        <meshStandardMaterial color="#24262d" />
      </mesh>
      <mesh position={[0.95, 0, 0.82]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.44, 0.09, 24, 48]} />
        <meshStandardMaterial color="#24262d" />
      </mesh>

      <mesh position={[0, 0.52, 0.1]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[0.6, 0.42, 1.2]} />
        <meshStandardMaterial color="#1f2430" metalness={0.2} roughness={0.45} />
      </mesh>

      <mesh position={[0, 0.84, 0.15]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.42, 0.26, 0.82]} />
        <meshStandardMaterial color="#c14617" metalness={0.12} roughness={0.35} />
      </mesh>

      <mesh position={[0, 0.95, 0.72]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[0.16, 0.1, 0.62]} />
        <meshStandardMaterial color="#2b3039" />
      </mesh>

      <mesh position={[0, 0.78, -0.4]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[0.34, 0.14, 0.72]} />
        <meshStandardMaterial color="#2b3039" />
      </mesh>

      <mesh position={[0, 0.24, -0.12]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.18, 0.52, 1.1]} />
        <meshStandardMaterial color="#7a858f" />
      </mesh>

      <mesh position={[0, 0.74, -0.9]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.12, 0.82, 0.08]} />
        <meshStandardMaterial color="#9da8af" />
      </mesh>

      <mesh position={[0, 0.74, 0.96]} rotation={[-0.06, 0, 0]}>
        <boxGeometry args={[0.12, 0.82, 0.08]} />
        <meshStandardMaterial color="#9da8af" />
      </mesh>

      <mesh position={[0, -0.54, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.4, 64]} />
        <meshStandardMaterial color="#ddccb5" />
      </mesh>
    </group>
  );
}

function AccessoryMeshes({ slotGroups }) {
  return slotGroups.map((group) => {
    const visual = slotVisuals[group.slot];
    const selectedProduct = group.selectedProduct;

    if (!visual || !selectedProduct) {
      return null;
    }

    return (
      <mesh key={group.slot} position={visual.position} scale={visual.scale} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={visual.color}
          metalness={0.22}
          roughness={0.3}
          opacity={group.slot === "adesivagem-completa" ? 0.36 : 0.94}
          transparent={group.slot === "adesivagem-completa"}
        />
      </mesh>
    );
  });
}

export function R15Scene({ slotGroups }) {
  return (
    <Canvas camera={{ position: [4.5, 2.6, 4.2], fov: 38 }} shadows>
      <color attach="background" args={["#f6ecdf"]} />
      <ambientLight intensity={1.2} />
      <directionalLight castShadow intensity={2} position={[8, 10, 6]} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight intensity={0.6} position={[-4, 2, -3]} />

      <group rotation={[0, -0.6, 0]}>
        <BaseMotorcycle />
        <AccessoryMeshes slotGroups={slotGroups} />
      </group>

      <OrbitControls
        autoRotate
        autoRotateSpeed={1.2}
        enablePan={false}
        enableDamping
        minDistance={3.8}
        maxDistance={8}
        minPolarAngle={0.8}
        maxPolarAngle={1.7}
      />
    </Canvas>
  );
}
