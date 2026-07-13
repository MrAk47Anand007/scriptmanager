import { NextResponse } from 'next/server';import { prisma } from '@/lib/db'
export async function GET(){return NextResponse.json(await prisma.notificationDelivery.findMany({include:{channel:true,rule:true},orderBy:{createdAt:'desc'},take:100}))}
