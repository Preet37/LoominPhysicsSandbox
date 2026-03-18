"use client"
import React, { useState, useEffect } from 'react';
import landingImg from './landing.jpg' 
import Image from "next/image";
import { redirect } from 'next/navigation';


function Landing() {
    return ( 
        <div className='mx-auto min-h-screen bg-gradient-to-b from-[#050914] via-[#0C1325] to-[#141C33] pt-32 px-22'>
            <div className='flex items-start justify-between gap-16'>
                <div className='max-w-2x1'>
                    <h1 className="mb-12 font-semibold text-[#E5E7EB] text-5xl">OpenNote AI Lorem ipsum dolor sit amet consectetur adipiscing elit. </h1>
                    <p className="mb-12 text-lg text-[#9CA3AF]">
                        Lorem ipsum dolor sit amet consectetur adipiscing elit. Sit amet consectetur adipiscing elit quisque faucibus ex. Adipiscing elit quisque faucibus ex sapien vitae pellentesque.
                    </p>
                    <div className='flex gap-8'>
                        <div className="max-w-2xs rounded-xl border border-white/10 bg-gradient-to-b from-[#0C1325] to-[#141C33] p-6 shadow-lg shadow-black/40 hover:scale-[1.05] transition-transform duration-300">
                            <h3 className="mb-4 text-xl font-semibold text-[#E5E7EB]">Header</h3>
                            <div className="my-3 h-px w-20 bg-white/30 rounded-full" />
                            <p className="text-base leading-relaxed text-[#9CA3AF]">Lorem ipsum dolor sit amet consectetur adipiscing elit. Sit amet consectetur adipiscing elit quisque faucibus ex. Adipiscing elit quisque faucibus ex sapien vitae pellentesque.</p>
                        </div>

                        <div className="max-w-2xs rounded-xl border border-white/10 bg-gradient-to-b from-[#0C1325] to-[#141C33] p-6 shadow-lg shadow-black/40 hover:scale-[1.05] transition-transform duration-300">
                            <h3 className="mb-4 text-xl font-semibold text-[#E5E7EB]">Header</h3>
                            <div className="my-3 h-px w-20 bg-white/30 rounded-full" />
                            <p className="text-base leading-relaxed text-[#9CA3AF]">Lorem ipsum dolor sit amet consectetur adipiscing elit. Sit amet consectetur adipiscing elit quisque faucibus ex. Adipiscing elit quisque faucibus ex sapien vitae pellentesque.</p>
                        </div>

                        <div className="max-w-2xs rounded-xl border border-white/10 bg-gradient-to-b from-[#0C1325] to-[#141C33] p-6 shadow-lg shadow-black/40 hover:scale-[1.05] transition-transform duration-300">
                            <h3 className="mb-4 text-xl font-semibold text-[#E5E7EB]">Header</h3>
                            <div className="my-3 h-px w-20 bg-white/30 rounded-full" />
                            <p className="text-base leading-relaxed text-[#9CA3AF]">Lorem ipsum dolor sit amet consectetur adipiscing elit. Sit amet consectetur adipiscing elit quisque faucibus ex. Adipiscing elit quisque faucibus ex sapien vitae pellentesque.</p>
                        </div>
                    </div>
                    <div className="mt-10 flex justify-center">
                        <button onClick={() => {redirect('/editor')}} className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/90 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 hover:scale-[1.05] duration-300">
                            Get started <span className="text-lg">➡️</span>
                        </button>
                    </div>                
                </div>

                <Image src={landingImg} alt="Landing preview" className="w-full max-w-lg rounded-2xl shadow-2xl object-cover ring-1 ring-black/5 translate-y-8" priority />

            </div>
        </div>

     );
}

export default Landing; 