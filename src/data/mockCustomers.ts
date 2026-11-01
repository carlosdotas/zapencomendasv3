import { Customer, AgendaContact } from '../types/customer';

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    fullName: 'Maria Eduarda Fernandes',
    phone: '(62) 99823-4411',
    cpf: '012.345.678-90',
    address: 'Av. Dep. Jamel Cecílio, 3300 - Jardim Goiás, Goiânia - GO',
    coordinates: { lat: -16.7118, lng: -49.2346 },
    additionalAddresses: [
      {
        id: 'addr-m-1',
        label: 'Trabalho / Escritório',
        address: 'Rua 14, 250 - Setor Marista, Goiânia - GO',
        coordinates: { lat: -16.6960, lng: -49.2620 }
      },
      {
        id: 'addr-m-2',
        label: 'Filial Bueno',
        address: 'Av. T-4, 800 - Setor Bueno, Goiânia - GO',
        coordinates: { lat: -16.7080, lng: -49.2690 }
      }
    ],
    email: 'maria.eduarda@email.com',
    notes: 'Condomínio Residencial - Portaria Social',
    orderCount: 18,
    createdAt: Date.now() - 86400000 * 15
  },
  {
    id: 'cust-2',
    fullName: 'Roberto Albuquerque Silva',
    phone: '(62) 98765-1234',
    cpf: '123.456.789-01',
    address: 'Av. T-63, Qd 145 Lt 08 - Setor Bueno, Goiânia - GO',
    coordinates: { lat: -16.6990, lng: -49.2650 },
    email: 'roberto.albuquerque@email.com',
    notes: 'Oficina Mecânica & Auto Peças',
    orderCount: 12,
    createdAt: Date.now() - 86400000 * 10
  },
  {
    id: 'cust-3',
    fullName: 'Camila Rodrigues Moreira',
    phone: '(62) 98112-9988',
    cpf: '234.567.890-12',
    address: 'Av. Rio Verde, Qd 102 - Vila São Tomaz, Aparecida de Goiânia - GO',
    coordinates: { lat: -16.7328, lng: -49.2802 },
    email: 'camila.moreira@email.com',
    notes: 'Marmoraria & Granitos São Tomaz',
    orderCount: 7,
    createdAt: Date.now() - 86400000 * 5
  },
  {
    id: 'cust-4',
    fullName: 'Lucas Gabriel Pinheiro',
    phone: '(62) 99345-6789',
    cpf: '345.678.901-23',
    address: 'Rua 9, 1250 - Setor Marista, Goiânia - GO',
    coordinates: { lat: -16.6950, lng: -49.2610 },
    email: 'lucas.pinheiro@email.com',
    notes: 'Escritório de Contabilidade',
    orderCount: 4,
    createdAt: Date.now() - 86400000 * 2
  },
  {
    id: 'cust-5',
    fullName: 'Ana Paula Vasconcelos',
    phone: '(62) 99456-7890',
    cpf: '456.789.012-34',
    address: 'Av. Anhanguera, 5100 - Setor Central, Goiânia - GO',
    coordinates: { lat: -16.6780, lng: -49.2590 },
    email: 'anapaula.vasconcelos@email.com',
    notes: 'Loja de Calçados Central',
    orderCount: 2,
    createdAt: Date.now() - 86400000 * 1
  }
];

export const INITIAL_AGENDA_CONTACTS: AgendaContact[] = [
  {
    id: 'agenda-1',
    name: 'Felipe Barreto Ramos',
    phone: '(62) 99654-3210',
    cpf: '543.210.987-65',
    email: 'felipe.barreto@gmail.com',
    address: 'Rua C-139, Setor Jardim América, Goiânia - GO',
    notes: 'Distribuidora de Bebidas',
    source: 'agenda'
  },
  {
    id: 'agenda-2',
    name: 'Juliana Castro Nogueira',
    phone: '(62) 98234-5678',
    email: 'juliana.castro@hotmail.com',
    address: 'Rua T-36, Setor Bueno, Goiânia - GO',
    notes: 'Farmácia & Drogaria Vida',
    source: 'agenda'
  },
  {
    id: 'agenda-3',
    name: 'Carlos Henrique Viana',
    phone: '(62) 99123-4567',
    email: 'carlos.viana@outlook.com',
    address: 'Av. Brasil, Centro, Anápolis - GO',
    notes: 'Ar-Condicionado e Refrigeração',
    source: 'agenda'
  },
  {
    id: 'agenda-4',
    name: 'Beatriz Lima Souza',
    phone: '(62) 98456-7891',
    cpf: '654.321.098-76',
    email: 'beatriz.lima@gmail.com',
    address: 'Av. São Paulo, Setor Campinas, Goiânia - GO',
    notes: 'Padaria & Confeitaria Imperial',
    source: 'agenda'
  },
  {
    id: 'agenda-5',
    name: 'Thiago Mendonça Prado',
    phone: '(62) 99789-0123',
    email: 'thiago.mendonca@gmail.com',
    address: 'Rua 44, Setor Norte Ferroviário, Goiânia - GO',
    notes: 'Confecções Polo 44 - Loja 24',
    source: 'agenda'
  },
  {
    id: 'agenda-6',
    name: 'Daniela Ferreira Guimarães',
    phone: '(62) 98567-8901',
    email: 'daniela.guimaraes@gmail.com',
    address: 'Av. 85, Setor Sul, Goiânia - GO',
    notes: 'Consultório Odontológico',
    source: 'agenda'
  },
  {
    id: 'agenda-7',
    name: 'Marcelo Ribeiro Guimarães',
    phone: '(62) 99876-5432',
    email: 'marcelo.motos@gmail.com',
    address: 'Av. Universitária, Vila Jaiara, Anápolis - GO',
    notes: 'Oficina de Motos & Peças',
    source: 'agenda'
  },
  {
    id: 'agenda-8',
    name: 'Eduardo Santos Silveira',
    phone: '(62) 98765-4321',
    email: 'eduardo.super@hotmail.com',
    address: 'Av. Manoel Monteiro, Centro, Trindade - GO',
    notes: 'Supermercado Central Trindade',
    source: 'agenda'
  },
  {
    id: 'agenda-9',
    name: 'Patrícia Rocha Alves',
    phone: '(62) 99321-7654',
    email: 'patricia.estetica@gmail.com',
    address: 'Rua 1136, Setor Marista, Goiânia - GO',
    notes: 'Salão de Beleza & Estética',
    source: 'agenda'
  }
];
